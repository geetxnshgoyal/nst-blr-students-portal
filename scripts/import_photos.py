#!/usr/bin/env python3
"""
Import photos from a folder (e.g. `Photo`) into the repo `photos/` folder,
rename them to the pattern `YourName_file.<ext>` and (optionally) update
`students.json` to point each matched student's `photo` to the new file.

Usage:
  python3 scripts/import_photos.py --src Photo --dest photos --apply

By default the script runs in dry-run mode and prints proposed actions.
Use `--apply` to actually copy files and write `students.json`.

Matching strategy:
- Normalize names (lowercase, strip punctuation) and try exact/substrate/fuzzy match
- If a match with ratio >= 0.60 is found, the photo is applied to that student
"""
import argparse
import json
import os
import re
import shutil
from difflib import SequenceMatcher


def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', (s or '').lower()).strip()


def sanitize_filename_for_student(name):
    # Convert "First Last" -> "First_Last_file" (keep ASCII alnum+underscore)
    s = re.sub(r'[^A-Za-z0-9]+', '_', name).strip('_')
    if not s:
        s = 'unknown'
    return f"{s}_file"


def best_student_match(students, candidate_name):
    nname = norm(candidate_name)
    # exact match
    for i, stu in enumerate(students):
        if norm(stu.get('name')) == nname:
            return i, 1.0
    # substring match
    for i, stu in enumerate(students):
        if nname in norm(stu.get('name', '')):
            return i, 0.9
    # fuzzy match
    best = (None, 0.0)
    for i, stu in enumerate(students):
        r = SequenceMatcher(None, nname, norm(stu.get('name', ''))).ratio()
        if r > best[1]:
            best = (i, r)
    return best


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--src', default='Photo', help='Source folder with incoming photos')
    p.add_argument('--dest', default='photos', help='Destination photos folder in repo')
    p.add_argument('--students', default='students.json', help='Path to students.json')
    p.add_argument('--apply', action='store_true', help='Actually copy files and update students.json')
    p.add_argument('--min-score', type=float, default=0.60, help='Min fuzzy score to accept a match')
    args = p.parse_args()

    if not os.path.isdir(args.src):
        print(f"Source folder '{args.src}' not found. Create it and put files there.")
        return
    if not os.path.isdir(args.dest):
        os.makedirs(args.dest, exist_ok=True)

    students = json.load(open(args.students))

    files = sorted([f for f in os.listdir(args.src) if os.path.isfile(os.path.join(args.src, f))])
    report = []

    for fn in files:
        src_path = os.path.join(args.src, fn)
        name_no_ext, ext = os.path.splitext(fn)
        candidate = name_no_ext

        # If user already named file like YourName_file, strip the suffix for matching
        cand_for_match = re.sub(r'_file$', '', candidate, flags=re.IGNORECASE)
        cand_for_match = cand_for_match.replace('_', ' ').replace('-', ' ')

        idx, score = best_student_match(students, cand_for_match)

        if idx is not None and score >= args.min_score:
            stu = students[idx]
            # Build destination filename using the student's canonical name
            dest_base = sanitize_filename_for_student(stu.get('name', cand_for_match))
            dest_name = dest_base + ext.lower()
            dest_path = os.path.join(args.dest, dest_name)

            # avoid clobbering existing file by adding a suffix if needed
            i = 1
            base_only, ext_only = os.path.splitext(dest_name)
            while os.path.exists(dest_path):
                dest_name = f"{base_only}_{i}{ext_only}"
                dest_path = os.path.join(args.dest, dest_name)
                i += 1

            entry = {
                'src': src_path,
                'dest': dest_path,
                'student_index': idx + 1,
                'student_name': stu.get('name'),
                'score': score,
            }

            if args.apply:
                shutil.copy2(src_path, dest_path)
                stu['photo'] = os.path.join(args.dest, os.path.basename(dest_path))
                entry['applied'] = True
            else:
                entry['applied'] = False

            report.append(entry)
        else:
            report.append({'src': src_path, 'dest': None, 'student_index': None, 'student_name': None, 'score': score})

    # if apply, write students.json
    if args.apply:
        json.dump(students, open(args.students, 'w'), indent=2)

    # print a short summary
    applied = [r for r in report if r.get('applied')]
    proposed = [r for r in report if r.get('dest') and not r.get('applied')]
    skipped = [r for r in report if not r.get('dest')]

    print(f"Files found in '{args.src}': {len(files)}")
    print(f"Proposed matches: {len(proposed)} (dry-run); Applied: {len(applied)}")
    print(f"Skipped / no good match: {len(skipped)}")

    # detailed lines
    for r in report:
        if r.get('dest'):
            status = 'APPLIED' if r.get('applied') else 'PROPOSED'
            print(f"{status}: {os.path.basename(r['src'])} -> {os.path.basename(r['dest'])} (student: {r['student_name']}, score={r['score']:.2f})")
        else:
            print(f"SKIP: {os.path.basename(r['src'])}  (no good match, score={r['score']:.2f})")


if __name__ == '__main__':
    main()
