from pathlib import Path
import re

root = Path(__file__).resolve().parent
build = root / '.cjs-build-new'

project_files = sorted(build.rglob('*.js'))
entry = build / 'main.js'
project_files.remove(entry)
project_files = [entry] + project_files
ids = {p.resolve(): i for i, p in enumerate(project_files)}
jszip_id = len(project_files)

req_re = re.compile(r"require\((['\"])([^'\"]+)\1\)")

def resolve_local(src: Path, dep: str) -> Path:
    target = (src.parent / dep)
    candidates = [target, target.with_suffix('.js'), target / 'index.js']
    for c in candidates:
        if c.exists() and c.is_file():
            return c.resolve()
    raise RuntimeError(f'Cannot resolve {dep!r} from {src}')

def transform(src: Path, code: str) -> str:
    def repl(m):
        dep = m.group(2)
        if dep == 'jszip':
            return f'__ge_require({jszip_id})'
        if dep.startswith('.'):
            target = resolve_local(src, dep)
            if target not in ids:
                raise RuntimeError(f'Local module not indexed: {target}')
            return f'__ge_require({ids[target]})'
        # Obsidian and any Node/Electron builtins stay external.
        return m.group(0)
    return req_re.sub(repl, code)

parts = []
parts.append('/*\nGrid Explorer native-navigation fork.\nGenerated locally from TypeScript without esbuild because the supplied node_modules contains a Windows-only esbuild binary.\n*/\n(function(){\nconst __ge_modules = {\n')
for p in project_files:
    code = transform(p, p.read_text(encoding='utf-8'))
    parts.append(f'{ids[p.resolve()]}: function(module, exports, __ge_require) {{\n{code}\n}},\n')

# Use JSZip's self-contained browser distribution as one CommonJS module.
jszip = root / 'node_modules/jszip/dist/jszip.min.js'
jszip_code = jszip.read_text(encoding='utf-8')
parts.append(f'{jszip_id}: function(module, exports, __ge_require) {{\n{jszip_code}\n}},\n')
parts.append('};\nconst __ge_cache = {};\nfunction __ge_require(id) { if (__ge_cache[id]) return __ge_cache[id].exports; const module = __ge_cache[id] = {exports:{}}; __ge_modules[id](module,module.exports,__ge_require); return module.exports; }\nmodule.exports = __ge_require(0);\n})();\n')

out = root / 'main.js'
out.write_text(''.join(parts), encoding='utf-8')
print(f'Wrote {out} ({out.stat().st_size} bytes), {len(project_files)} project modules + JSZip')
