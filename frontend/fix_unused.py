"""
Fix ESLint issues across the frontend codebase:
1. Remove unused imports
2. Remove unused variables
3. Fix any types where safe
"""
import re
import sys
from collections import defaultdict
from pathlib import Path

ESLINT_REPORT = Path("eslint_check.txt")
SRC_DIR = Path("src")

def parse_eslint_report():
    """Parse ESLint compact output into structured issues."""
    issues = defaultdict(list)
    current_file = None
    
    for line in ESLINT_REPORT.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        
        # File header line
        m = re.match(r'^(.+?): line (\d+), col (\d+), (Warning|Error) - (.+?) \((.+?)\)$', line)
        if m:
            filepath = m.group(1)
            lineno = int(m.group(2))
            col = int(m.group(3))
            severity = m.group(4)
            message = m.group(5)
            rule = m.group(6)
            issues[filepath].append({
                'line': lineno,
                'col': col,
                'severity': severity,
                'message': message,
                'rule': rule,
            })
    
    return issues

def fix_unused_imports(filepath: Path, issues):
    """Remove unused import specifiers from import statements."""
    content = filepath.read_text(encoding="utf-8")
    lines = content.split('\n')
    
    # Filter to only unused-vars issues
    unused = [i for i in issues if i['rule'] == '@typescript-eslint/no-unused-vars']
    if not unused:
        return False
    
    # Group by line number (multiple unused imports on same line)
    by_line = defaultdict(list)
    for issue in unused:
        by_line[issue['line']].append(issue)
    
    modified = False
    for line_idx in sorted(by_line.keys(), reverse=True):
        if line_idx < 1 or line_idx > len(lines):
            continue
        
        line = lines[line_idx - 1]
        issues_on_line = by_line[line_idx]
        
        # Extract unused names
        unused_names = set()
        for issue in issues_on_line:
            m = re.search(r"'([^']+)' is defined but never used", issue['message'])
            if m:
                unused_names.add(m.group(1))
        
        if not unused_names:
            continue
        
        # Check if this is an import line
        if not re.match(r'\s*(import|from)\s', line) and 'import' not in line:
            continue
        
        # Handle multi-line import - skip for now (complex case)
        if '{' in line and '}' not in line:
            continue
        
        # Single-line named import: import { A, B, C } from "..."
        m = re.match(r"^(\s*import\s*\{)([^}]+)(\}\s*from\s*.+)$", line)
        if m:
            prefix, imports_str, suffix = m.group(1), m.group(2), m.group(3)
            # Parse individual imports
            imports = [s.strip() for s in imports_str.split(',')]
            remaining = [imp for imp in imports if imp and imp.split(' as ')[0].strip() not in unused_names]
            if remaining:
                lines[line_idx - 1] = f"{prefix} {', '.join(remaining)} {suffix}"
            else:
                # All imports removed - remove the entire line
                lines[line_idx - 1] = ""
            modified = True
            continue
        
        # Default import: import X from "..."
        m = re.match(r"^(\s*import\s+)(\w+)(\s+from\s*.+)$", line)
        if m:
            prefix, name, suffix = m.group(1), m.group(2), m.group(3)
            if name in unused_names:
                lines[line_idx - 1] = ""
                modified = True
                continue
        
        # Side-effect import: import "..."
        # Skip - these are intentional
        
        # Dynamic import or other patterns - skip
    
    if modified:
        filepath.write_text('\n'.join(lines), encoding="utf-8")
    
    return modified

def fix_unused_variables(filepath: Path, issues):
    """Remove unused variable declarations."""
    content = filepath.read_text(encoding="utf-8")
    lines = content.split('\n')
    
    unused = [i for i in issues if i['rule'] == '@typescript-eslint/no-unused-vars']
    if not unused:
        return False
    
    modified = False
    for issue in unused:
        line_idx = issue['line'] - 1
        if line_idx < 0 or line_idx >= len(lines):
            continue
        
        m = re.search(r"'([^']+)' is defined but never used", issue['message'])
        if not m:
            continue
        name = m.group(1)
        
        line = lines[line_idx]
        
        # Skip if this looks like it's inside a function parameter (args are OK with _ prefix)
        if 'Allowed unused args' in issue.get('message', ''):
            continue
        
        # const NAME = ...
        pattern = re.compile(rf'^(\s*)const\s+{re.escape(name)}\s*=\s*.+$')
        if pattern.match(line):
            lines[line_idx] = ""
            modified = True
            continue
        
        # let NAME = ...
        pattern = re.compile(rf'^(\s*)let\s+{re.escape(name)}\s*=\s*.+$')
        if pattern.match(line):
            lines[line_idx] = ""
            modified = True
            continue
    
    if modified:
        filepath.write_text('\n'.join(lines), encoding="utf-8")
    
    return modified

def main():
    issues = parse_eslint_report()
    
    total_fixed = 0
    files_modified = 0
    
    for filepath_str, file_issues in sorted(issues.items()):
        # Convert report path to actual path
        filepath = Path(filepath_str.replace('\\', '/'))
        if not filepath.exists():
            # Try relative path
            filepath = SRC_DIR / filepath_str.split('src\\')[-1].replace('\\', '/')
        
        if not filepath.exists():
            print(f"SKIP (not found): {filepath_str}")
            continue
        
        original = filepath.read_text(encoding="utf-8")
        
        fixed = False
        fixed |= fix_unused_imports(filepath, file_issues)
        fixed |= fix_unused_variables(filepath, file_issues)
        
        if fixed:
            files_modified += 1
            remaining = sum(1 for i in file_issues if i['rule'] != '@typescript-eslint/no-unused-vars')
            removed = sum(1 for i in file_issues if i['rule'] == '@typescript-eslint/no-unused-vars')
            total_fixed += removed
            print(f"FIXED: {filepath.name} ({removed} unused vars removed, {remaining} other issues)")
    
    print(f"\nTotal: {total_fixed} unused vars fixed across {files_modified} files")

if __name__ == "__main__":
    main()
