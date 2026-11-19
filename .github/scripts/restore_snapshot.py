#!/usr/bin/env python3
"""Restore a pinned public N1 release snapshot without using credentials.

The manifest and archive manifest are pinned by SHA256. All parts and rebuilt
packages are verified before extracting a site. Site extraction preserves the
checkout's .git and .github directories and rejects archive traversal/symlinks.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
import zipfile

OWNER = 'Subterranean-Sun'
SOURCE_REPOSITORY = OWNER + '/n1-archive'
SNAPSHOT_TAG = 'snapshot-2026-11-19'
MANIFEST_SHA256 = 'c59166f08cd68a86f5c34416d247b43c851f554d833eb4b81ab4763dfb80802a'
ARCHIVE_MANIFEST_SHA256 = '2539b9695a877833aca494d95f5ec3e4bfaa7a5012e8174c659f67c36c6ca980'
TARGETS = {'n1-study', 'n1-audio', 'original-materials', 'original-answers'}
MAX_PART_BYTES = 32 * 1024 * 1024
MAX_PACKAGE_BYTES = 2 * 1024 * 1024 * 1024
SHA256_RE = re.compile(r'^[0-9a-f]{64}$')


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def asset_url(name: str) -> str:
    return f'https://github.com/{SOURCE_REPOSITORY}/releases/download/{SNAPSHOT_TAG}/{quote(name, safe="")}'


def download(name: str, output: Path, expected_sha: str, expected_size: int | None = None,
             max_size: int = MAX_PART_BYTES) -> Path:
    if not SHA256_RE.fullmatch(expected_sha):
        raise ValueError(f'Invalid expected digest for {name}')
    if output.is_file() and (expected_size is None or output.stat().st_size == expected_size) and sha256_file(output) == expected_sha:
        return output
    output.parent.mkdir(parents=True, exist_ok=True)
    partial = output.with_name(output.name + '.partial')
    last_error = None
    for attempt in range(1, 7):
        try:
            digest = hashlib.sha256()
            total = 0
            request = Request(asset_url(name), headers={'User-Agent': 'n1-snapshot-restorer/1', 'Accept': 'application/octet-stream'})
            with urlopen(request, timeout=90) as response, partial.open('wb') as target:
                for chunk in iter(lambda: response.read(1024 * 1024), b''):
                    total += len(chunk)
                    if total > max_size:
                        raise ValueError(f'{name}: download exceeds expected limit')
                    digest.update(chunk)
                    target.write(chunk)
            if expected_size is not None and total != expected_size:
                raise ValueError(f'{name}: size mismatch ({total} != {expected_size})')
            if digest.hexdigest() != expected_sha:
                raise ValueError(f'{name}: SHA256 mismatch')
            os.replace(partial, output)
            return output
        except (HTTPError, URLError, OSError, ValueError, TimeoutError) as error:
            last_error = error
            partial.unlink(missing_ok=True)
            if attempt == 6:
                break
            print(f'{name}: attempt {attempt} failed; retrying ({type(error).__name__})', flush=True)
            time.sleep(min(30, 2 ** attempt))
    raise RuntimeError(f'Could not obtain verified asset {name}: {last_error}')


def validate_manifest(manifest: dict) -> None:
    if manifest.get('schemaVersion') != 1 or manifest.get('owner') != OWNER or manifest.get('releaseTag') != SNAPSHOT_TAG:
        raise ValueError('Unexpected manifest identity/schema')
    if set(manifest.get('targets', {})) != TARGETS:
        raise ValueError('Unexpected snapshot target set')
    seen_names = set()
    for name, target in manifest['targets'].items():
        file_name = target.get('fileName', '')
        if PurePosixPath(file_name).name != file_name or not file_name.endswith('.zip') or '\\' in file_name:
            raise ValueError(f'{name}: invalid ZIP filename')
        if not isinstance(target.get('totalBytes'), int) or not 0 < target['totalBytes'] < MAX_PACKAGE_BYTES:
            raise ValueError(f'{name}: invalid package size')
        if not SHA256_RE.fullmatch(target.get('sha256', '')):
            raise ValueError(f'{name}: invalid package digest')
        parts = target.get('parts', [])
        if not parts or len(parts) > 100:
            raise ValueError(f'{name}: invalid part count')
        for index, part in enumerate(parts, 1):
            if part.get('name') != f'{name}-{index:04d}.part' or part['name'] in seen_names:
                raise ValueError(f'{name}: invalid/duplicate part name')
            seen_names.add(part['name'])
            if not isinstance(part.get('bytes'), int) or not 0 < part['bytes'] <= MAX_PART_BYTES:
                raise ValueError(f'{name}: invalid part size')
            if not SHA256_RE.fullmatch(part.get('sha256', '')):
                raise ValueError(f'{name}: invalid part digest')
        if sum(part['bytes'] for part in parts) != target['totalBytes']:
            raise ValueError(f'{name}: inconsistent part/package sizes')


def get_snapshot(work: Path, selected: list[str], include_archive_manifest: bool) -> tuple[dict, dict[str, Path]]:
    manifest_path = download('transport-manifest.json', work / 'transport-manifest.json', MANIFEST_SHA256, max_size=1024 * 1024)
    manifest = json.loads(manifest_path.read_text('utf-8'))
    validate_manifest(manifest)
    jobs = [part for name in selected for part in manifest['targets'][name]['parts']]
    with ThreadPoolExecutor(max_workers=4) as executor:
        pending = {executor.submit(download, p['name'], work / 'parts' / p['name'], p['sha256'], p['bytes']): p['name'] for p in jobs}
        for future in as_completed(pending):
            future.result()
            print('Verified part ' + pending[future], flush=True)
    packages = {}
    for name in selected:
        item = manifest['targets'][name]
        package = work / 'packages' / item['fileName']
        package.parent.mkdir(parents=True, exist_ok=True)
        partial = package.with_name(package.name + '.partial')
        digest = hashlib.sha256()
        total = 0
        with partial.open('wb') as target:
            for part in item['parts']:
                with (work / 'parts' / part['name']).open('rb') as source:
                    for chunk in iter(lambda: source.read(1024 * 1024), b''):
                        digest.update(chunk)
                        target.write(chunk)
                        total += len(chunk)
        if total != item['totalBytes'] or digest.hexdigest() != item['sha256']:
            partial.unlink(missing_ok=True)
            raise RuntimeError(f'{name}: reconstructed package failed verification')
        os.replace(partial, package)
        packages[name] = package
        print(f'Verified package {name}: {total} bytes', flush=True)
    if include_archive_manifest:
        download('archive-manifest.json', work / 'archive-manifest.json', ARCHIVE_MANIFEST_SHA256, max_size=1024 * 1024)
    return manifest, packages


def validate_zip_entries(archive: zipfile.ZipFile) -> list[zipfile.ZipInfo]:
    entries = archive.infolist()
    seen = set()
    total_uncompressed = 0
    for item in entries:
        raw = item.filename
        parts = tuple(raw.rstrip('/').split('/'))
        if not raw or raw.startswith('/') or '\\' in raw or '\x00' in raw or not parts:
            raise ValueError(f'Unsafe ZIP member: {raw!r}')
        if any(x.casefold() in {'', '.', '..', '.git', '.github'} or ':' in x for x in parts):
            raise ValueError(f'Protected/traversal ZIP member: {raw!r}')
        if any(x.endswith((' ', '.')) for x in parts):
            raise ValueError(f'Ambiguous ZIP member: {raw!r}')
        if stat.S_ISLNK(item.external_attr >> 16):
            raise ValueError(f'ZIP symlink rejected: {raw!r}')
        key = '/'.join(parts).casefold()
        if key in seen:
            raise ValueError(f'Duplicate ZIP member: {raw!r}')
        seen.add(key)
        total_uncompressed += item.file_size
        if total_uncompressed > MAX_PACKAGE_BYTES or len(entries) > 10000:
            raise ValueError('ZIP exceeds snapshot extraction limits')
    if not any(x.filename == 'index.html' and not x.is_dir() for x in entries):
        raise ValueError('Site snapshot has no root index.html')
    return entries


def restore_site(package: Path, target_name: str, repository_root: Path, work: Path) -> None:
    root = repository_root.resolve()
    work = work.resolve()
    if target_name not in {'n1-study', 'n1-audio'} or not root.is_dir() or not (root / '.git').exists():
        raise ValueError('Site restore requires a dedicated existing Git checkout')
    if work == root or root in work.parents:
        raise ValueError('Work directory must be outside the checkout')
    github_repository = os.environ.get('GITHUB_REPOSITORY')
    if github_repository and github_repository != f'{OWNER}/{target_name}':
        raise ValueError('GitHub checkout does not match the selected snapshot target')
    staging = work / f'extract-{target_name}'
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    try:
        with zipfile.ZipFile(package) as archive:
            entries = validate_zip_entries(archive)
            for item in entries:
                destination = staging.joinpath(*PurePosixPath(item.filename).parts)
                if item.is_dir():
                    destination.mkdir(parents=True, exist_ok=True)
                    continue
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(item) as source, destination.open('xb') as output:
                    shutil.copyfileobj(source, output, 1024 * 1024)
        # The whole ZIP has now been safely extracted and CRC-checked. Only this
        # dedicated checkout is replaced; authentication/workflows stay intact.
        for current in root.iterdir():
            if current.name in {'.git', '.github'}:
                continue
            if current.is_dir() and not current.is_symlink():
                shutil.rmtree(current)
            else:
                current.unlink()
        for current in staging.iterdir():
            shutil.move(str(current), str(root / current.name))
    finally:
        if staging.exists():
            shutil.rmtree(staging)
    print(f'Restored {target_name}; preserved .git and .github', flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', action='append', choices=sorted(TARGETS), required=True)
    parser.add_argument('--work-dir', type=Path, required=True)
    parser.add_argument('--extract', action='store_true')
    parser.add_argument('--repository-root', type=Path)
    parser.add_argument('--archive-manifest', action='store_true')
    args = parser.parse_args()
    selected = list(dict.fromkeys(args.target))
    if args.extract and (len(selected) != 1 or selected[0] not in {'n1-study', 'n1-audio'} or args.repository_root is None):
        parser.error('--extract requires exactly one site target and --repository-root')
    args.work_dir.mkdir(parents=True, exist_ok=True)
    manifest, packages = get_snapshot(args.work_dir, selected, args.archive_manifest)
    if args.extract:
        restore_site(packages[selected[0]], selected[0], args.repository_root, args.work_dir)
    print(json.dumps({'targets': selected, 'packages': {k: str(v) for k, v in packages.items()}, 'manifestSHA256': MANIFEST_SHA256}, ensure_ascii=False))


if __name__ == '__main__':
    main()
