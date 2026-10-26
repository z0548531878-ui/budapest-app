# Direct Wikimedia thumbnail URL for a Special:FilePath image (must match imgFast() in index.html)
import re, hashlib, urllib.parse
def thumb(u, w=500):
    name = urllib.parse.unquote(u.split('Special:FilePath/')[1].split('?')[0]).replace(' ', '_')
    name = name[0].upper() + name[1:]
    m = hashlib.md5(name.encode()).hexdigest()
    t = f"{w}px-{name}" + ('.png' if name.lower().endswith('.svg') else '')
    return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{m[0]}/{m[:2]}/{urllib.parse.quote(name)}/{urllib.parse.quote(t)}"
def photos(html):
    return sorted(set(u.replace("\\'", "'") for u in re.findall(r"img:'(https://commons\.wikimedia\.org/wiki/Special:FilePath/(?:[^'\\]|\\.)*)'", html)))
