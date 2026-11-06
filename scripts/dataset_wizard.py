#!/usr/bin/env python3
"""Local screen to review a municipality's datasets, approve them and press Proceed.

    python scripts/dataset_wizard.py

Open http://127.0.0.1:8770 . Proceed builds the city, installs it into src/data and runs the
structure check. If the check fails, the previous city is put back. A running dev server picks
up the new files by itself.

This tool runs scripts on your machine, so it listens only on 127.0.0.1, requires a per-run
token and rejects other hosts. It is not part of the deployed app.
"""
import argparse
import base64
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
BUILD = ROOT / "scripts" / "build_municipality.py"
CITIES = ROOT / "data" / "municipalities"
UPLOADS = ROOT / "data" / "uploads"
SRC_DATA = ROOT / "src" / "data"
APP_FILES = ("stadtteile", "gitter", "blocke", "versorgung", "gebaeude", "summary", "naturschutzgebiete", "gewerbe", "zukunft-bloecke", "stadt")
FILE_FLAG = {"districts": "--districts-file", "buildings": "--buildings-file", "nature": "--nsg-file", "flood": "--flood-file",
             "fnp": "--fnp-file", "commercial": "--commercial-file"}
TOKEN = secrets.token_urlsafe(24)
APP_URL = "http://localhost:5174"

job = {"state": "idle", "kind": "", "log": [], "result": None, "error": ""}
lock = threading.Lock()


def set_job(**kw):
    with lock:
        job.update(kw)


def say(line):
    with lock:
        job["log"].append(line.rstrip()[:200])
        del job["log"][:-200]


def run(cmd):
    """Streams a command into the job log; returns (exit code, marked result)."""
    result = None
    p = subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                         errors="replace", env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"})
    for line in p.stdout:
        if line.startswith("@@RESULT "):
            result = json.loads(line[9:])
        else:
            say(line)
    return p.wait(), result


def contract_check():
    """Structure check against the Lüneburg shape. Returns (passed, failures, number of checks)."""
    node = shutil.which("npx") or shutil.which("npx.cmd")
    if not node:
        return False, ["npx not found, so the structure check could not run"], 0
    say("Checking the dashboard structure against the Lüneburg version ...")
    out = ROOT / "data" / "check.json"
    p = subprocess.run([node, "vitest", "run", "src/test/city-contract.test.ts", "--reporter=json", f"--outputFile={out}"],
                       cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    try:
        r = json.loads(out.read_text(encoding="utf-8"))
        rows = [a for f in r["testResults"] for a in f["assertionResults"]]
        bad = [f"{a['title']}: {(a.get('failureMessages') or [''])[0][:160]}" for a in rows if a["status"] == "failed"]
        return not bad and bool(rows), bad, len(rows)
    except Exception:  # noqa: BLE001
        return False, [(p.stdout or p.stderr)[-300:]], 0


def copy_app_files(frm, to):
    for n in APP_FILES:
        shutil.copy(Path(frm) / f"{n}.json", Path(to) / f"{n}.json")


def slug_of(name):
    from build_municipality import slugify
    return slugify(name)


def search_places(query):
    """Municipalities matching a name, so the user can tell the many Neustadts apart."""
    hits = json.load(urlopen(Request("https://nominatim.openstreetmap.org/search?" + urlencode(
        {"q": query, "countrycodes": "de", "format": "jsonv2", "limit": 12}), headers={"User-Agent": "HousingRadar-dataset-tool/1.0"}), timeout=20))
    seen, out = set(), []
    for h in hits:
        if h["osm_type"] == "relation" and h["category"] == "boundary" and h.get("addresstype") in ("city", "town", "village", "municipality") and h["osm_id"] not in seen:
            seen.add(h["osm_id"])
            parts = h["display_name"].split(", ")
            out.append(dict(osmId=h["osm_id"], name=parts[0], area=", ".join(parts[1:-1])))
    return out


def worker_discover(query):
    try:
        arg = ["--ags", query] if re.fullmatch(r"\d{7,8}", query) else ["--osm-id", query]
        code, res = run([sys.executable, str(BUILD), *arg, "--discover"])
        if code or not res:
            set_job(state="error", error="Could not check this municipality. If the log says OpenStreetMap is not answering, try again in a few minutes.")
        else:
            set_job(state="done", result=res)
    except Exception as e:  # noqa: BLE001
        set_job(state="error", error=str(e))


def activate(folder):
    """Installs a built city, runs the check and restores the previous city if it fails."""
    backup = ROOT / "data" / "previous"
    backup.mkdir(parents=True, exist_ok=True)
    copy_app_files(SRC_DATA, backup)
    original = CITIES / "_original"
    if not original.exists():
        original.mkdir(parents=True)
        copy_app_files(SRC_DATA, original)
    copy_app_files(folder, SRC_DATA)
    passed, bad, n = contract_check()
    if not passed:
        copy_app_files(backup, SRC_DATA)
        say("Structure check failed, previous city restored.")
    return passed, bad, n


def worker_build(body):
    try:
        ags, name = body["ags"], body["name"]
        folder = CITIES / slug_of(name)
        cmd = [sys.executable, str(BUILD), "--ags", ags, "--out", str(folder)]
        skip = [s for s in body.get("skip", []) if re.fullmatch(r"[a-z]+", s)]
        if skip:
            cmd += ["--skip", ",".join(skip)]
        for layer, path in body.get("files", {}).items():
            if layer in FILE_FLAG and Path(path).resolve().is_relative_to(UPLOADS.resolve()):
                cmd += [FILE_FLAG[layer], path]
        if body.get("districtField"):
            cmd += ["--district-name-field", body["districtField"]]
        code, _ = run(cmd)
        if code:
            set_job(state="error", error="The build stopped. See the log above.")
            return
        passed, bad, n = activate(folder)
        manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
        if passed:
            set_job(state="done", result=dict(name=name, checks=n, manifest=manifest))
        else:
            set_job(state="error", error="Structure check failed, so the previous city stays active: " + "; ".join(bad)[:900])
    except Exception as e:  # noqa: BLE001
        set_job(state="error", error=str(e))


def worker_activate(slug):
    try:
        passed, bad, n = activate(CITIES / slug)
        if passed:
            name = json.loads((SRC_DATA / "stadt.json").read_text(encoding="utf-8"))["name"]
            set_job(state="done", result=dict(name=name, checks=n, manifest=None))
        else:
            set_job(state="error", error="; ".join(bad)[:900])
    except Exception as e:  # noqa: BLE001
        set_job(state="error", error=str(e))


def start(kind, fn, *args):
    with lock:
        if job["state"] == "running":
            return False
        job.update(state="running", kind=kind, log=[], result=None, error="")
    threading.Thread(target=fn, args=args, daemon=True).start()
    return True


def built_cities():
    out = []
    for d in sorted(CITIES.glob("*")) if CITIES.exists() else []:
        s = d / "stadt.json"
        if s.exists():
            out.append(dict(slug=d.name, name=json.loads(s.read_text(encoding="utf-8"))["name"], original=d.name == "_original"))
    return out


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype + "; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def host_ok(self):
        return self.headers.get("Host", "").split(":")[0] in ("127.0.0.1", "localhost")

    def do_GET(self):
        if not self.host_ok():
            return self.send(403, {"error": "forbidden"})
        if self.path.split("?")[0] == "/":
            return self.send(200, PAGE.replace("__TOKEN__", TOKEN).replace("__APP__", APP_URL).encode(), "text/html")
        if self.headers.get("X-Token") != TOKEN:
            return self.send(403, {"error": "forbidden"})
        if self.path == "/api/job":
            with lock:
                return self.send(200, dict(job))
        if self.path == "/api/cities":
            active = json.loads((SRC_DATA / "stadt.json").read_text(encoding="utf-8"))["name"]
            return self.send(200, {"cities": built_cities(), "active": active})
        self.send(404, {"error": "not found"})

    def do_POST(self):
        if not self.host_ok() or self.headers.get("X-Token") != TOKEN:
            return self.send(403, {"error": "forbidden"})
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        if self.path == "/api/search":
            q = str(body.get("query", "")).strip()
            if not q:
                return self.send(400, {"error": "Enter a municipality"})
            if re.fullmatch(r"\d{7,8}", q):
                return self.send(200, {"places": [dict(osmId=q, name=q, area="municipality key")]})
            try:
                return self.send(200, {"places": search_places(q)})
            except Exception:  # noqa: BLE001
                return self.send(502, {"error": "The search service did not answer. Try again in a moment."})
        if self.path == "/api/discover":
            q = str(body.get("query", "")).strip()
            if not q:
                return self.send(400, {"error": "Enter a municipality"})
            return self.send(200, {"started": start("discover", worker_discover, q)})
        if self.path == "/api/build":
            return self.send(200, {"started": start("build", worker_build, body)})
        if self.path == "/api/activate":
            slug = str(body.get("slug", ""))
            if not re.fullmatch(r"[_a-z0-9-]+", slug) or not (CITIES / slug / "stadt.json").exists():
                return self.send(400, {"error": "unknown city"})
            return self.send(200, {"started": start("activate", worker_activate, slug)})
        if self.path == "/api/upload":
            layer = str(body.get("layer", ""))
            name = re.sub(r"[^\w.\-]", "_", Path(str(body.get("filename", "file"))).name)
            if layer not in FILE_FLAG:
                return self.send(400, {"error": "unknown dataset"})
            folder = UPLOADS / layer
            folder.mkdir(parents=True, exist_ok=True)
            path = folder / name
            path.write_bytes(base64.b64decode(body["data"]))
            fields = []
            try:
                if layer == "districts":
                    import pyogrio
                    fields = [str(f) for f in pyogrio.read_info(path)["fields"]]
            except Exception as e:  # noqa: BLE001
                return self.send(400, {"error": f"Could not read this file: {e}"})
            return self.send(200, {"path": str(path), "fields": fields})
        self.send(404, {"error": "not found"})


PAGE = r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Housing Radar datasets</title><style>
:root{--bg:#f7f5ef;--card:#fff;--ink:#1f2933;--mut:#5f6b76;--line:#d9d5ca;--pri:#9b2c2c;--ok:#1f7a4d;--warn:#a16207;--bad:#b42318}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif}
main{max-width:980px;margin:0 auto;padding:28px 16px 60px}h1{margin:0;font-size:30px}.sub{color:var(--mut);margin:4px 0 22px}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:16px;margin-bottom:16px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}input[type=text],select{padding:9px 10px;border:1px solid var(--line);border-radius:6px;font:inherit;background:#fff}
input[type=text]{flex:1;min-width:220px}button{padding:9px 14px;border:1px solid var(--pri);background:var(--pri);color:#fff;border-radius:6px;font:inherit;font-weight:600;cursor:pointer}
button.ghost{background:transparent;color:var(--pri)}button:disabled{opacity:.5;cursor:default}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:12px;color:var(--mut);padding:6px 8px;border-bottom:1px solid var(--line)}td{padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.tag{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;font-weight:600}.found{color:var(--ok);background:#e6f4ec}.fallback{color:var(--warn);background:#fbf1dc}.missing{color:var(--bad);background:#fde9e7}.unknown{color:var(--mut);background:#ece9e1}
small{color:var(--mut)}pre{background:#1f2933;color:#e7edf3;padding:12px;border-radius:6px;max-height:280px;overflow:auto;font-size:12px;margin:10px 0 0;white-space:pre-wrap}
.msg{padding:10px 12px;border-radius:6px;margin-top:10px}.err{background:#fde9e7;color:var(--bad)}.good{background:#e6f4ec;color:var(--ok)}a{color:var(--pri)}
main.embed{padding:12px}main.embed h1{display:none}@media(max-width:520px){td:nth-child(3),th:nth-child(3){display:none}}
</style></head><body><main>
<h1>Housing Radar datasets</h1><p class="sub">Active city: <b id="active">…</b>. Review what exists for a municipality, approve it and press Proceed.</p>
<div class="card"><div class="row"><input type="text" id="q" placeholder="Any municipality in Germany, or its 8-digit key" aria-label="Municipality"><button id="find">Search</button></div>
<div class="row" id="places" style="margin-top:10px"></div><div class="row" id="saved" style="margin-top:10px"></div></div>
<div class="card" id="review" hidden><h2 id="city" style="margin:0"></h2><p class="sub" id="cityinfo" style="margin-bottom:8px"></p>
<table><thead><tr><th>Use</th><th>Dataset</th><th>If left out</th><th>Your file</th></tr></thead><tbody id="rows"></tbody></table>
<div class="row" style="margin-top:14px"><button id="go">Proceed</button><small>Builds the city, updates the dashboard and checks its structure against Lüneburg.</small></div></div>
<div class="card" id="progress" hidden><b id="ptitle"></b><div id="pmsg"></div><pre id="log"></pre></div>
</main><script>
const EMBED=new URLSearchParams(location.search).has("embed");if(EMBED)document.querySelector("main").classList.add("embed");
const T="__TOKEN__",APP="__APP__",H={"X-Token":T,"Content-Type":"application/json"};
const $=i=>document.getElementById(i);let found=null,files={},dField="";
const api=(p,b)=>fetch(p,b?{method:"POST",headers:H,body:JSON.stringify(b)}:{headers:H}).then(r=>r.json());
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const LABEL={found:"Found",fallback:"Fallback",missing:"Not found",unknown:"Not checked"};
async function cities(){const r=await api("/api/cities");$("active").textContent=r.active;
 $("saved").innerHTML=r.cities.length?"<small>Built already:</small> "+r.cities.map(c=>`<button class="ghost" data-slug="${esc(c.slug)}">${c.original?"Back to original "+esc(c.name):esc(c.name)}</button>`).join(" "):"";
 document.querySelectorAll("[data-slug]").forEach(b=>b.onclick=async()=>{await api("/api/activate",{slug:b.dataset.slug});watch("Switching city")})}
function render(d){found=d;files={};dField="";$("review").hidden=false;$("city").textContent=d.name;$("cityinfo").textContent=`${d.state} · municipality key ${d.ags}`;
 $("rows").innerHTML=d.datasets.map(x=>`<tr><td><input type="checkbox" data-id="${x.id}" ${x.status!=="missing"||x.required?"checked":""} ${x.required?"disabled":""} aria-label="Use ${esc(x.name)}"></td>
 <td><b>${esc(x.name)}</b> <span class="tag ${x.status}">${LABEL[x.status]}</span><br><small>${esc(x.source)}${x.detail?" · "+esc(x.detail):""}</small></td>
 <td><small>${esc(x.affects)}</small></td>
 <td>${x.upload?`<input type="file" data-up="${x.id}" aria-label="Upload ${esc(x.name)}"><div id="f-${x.id}"></div>`:""}</td></tr>`).join("");
 document.querySelectorAll("[data-up]").forEach(i=>i.onchange=()=>upload(i))}
async function upload(i){const f=i.files[0];if(!f)return;const id=i.dataset.up,o=$("f-"+id);o.innerHTML="<small>Uploading…</small>";
 const data=await new Promise(r=>{const x=new FileReader();x.onload=()=>r(x.result.split(",")[1]);x.readAsDataURL(f)});
 const r=await api("/api/upload",{layer:id,filename:f.name,data});if(r.error){o.innerHTML=`<small style="color:var(--bad)">${esc(r.error)}</small>`;return}
 files[id]=r.path;const box=document.querySelector(`[data-id=${id}]`);if(box)box.checked=true;
 if(id==="districts"){o.innerHTML=`<small>Name column:</small> <select id="dfield">${r.fields.map(n=>`<option>${esc(n)}</option>`).join("")}</select>`;dField=r.fields[0]||"";$("dfield").onchange=e=>dField=e.target.value}
 else o.innerHTML="<small>Ready</small>"}
async function watch(title){$("progress").hidden=false;$("ptitle").textContent=title;$("progress").scrollIntoView({behavior:"smooth",block:"start"});$("pmsg").innerHTML="";$("find").disabled=$("go").disabled=true;
 for(;;){await new Promise(r=>setTimeout(r,1200));const j=await api("/api/job");$("log").textContent=j.log.join("\n");$("log").scrollTop=1e6;
  if(j.state==="running")continue;$("find").disabled=$("go").disabled=false;
  if(j.state==="error"){$("pmsg").innerHTML=`<div class="msg err">${esc(j.error)}</div>`;break}
  if(j.kind==="discover"){$("progress").hidden=true;render(j.result);break}
  const skipped=j.result.manifest?Object.entries(j.result.manifest.layers).filter(([,v])=>["missing","skipped"].includes(v.tier)).map(([k])=>k):[];
  $("pmsg").innerHTML=`<div class="msg good"><b>${esc(j.result.name)}</b> is live. ${j.result.checks} structure checks passed.${skipped.length?" Left out: "+esc(skipped.join(", "))+".":""} ${EMBED?"Loading it…":`<a href="${APP}" target="_blank" rel="noreferrer">Open the dashboard</a>`}</div>`;
  $("review").hidden=true;cities();if(EMBED)setTimeout(()=>parent.postMessage("city-installed","*"),1500);break}}
async function pick(id,name){$("places").innerHTML="";$("review").hidden=true;const r=await api("/api/discover",{query:String(id)});if(r.error){$("places").innerHTML=`<div class="msg err">${esc(r.error)}</div>`;return}watch("Looking for datasets in "+name)}
$("find").onclick=async()=>{const q=$("q").value.trim();if(!q)return;$("review").hidden=true;$("places").innerHTML="<small>Searching…</small>";
 const r=await api("/api/search",{query:q});if(r.error){$("places").innerHTML=`<div class="msg err">${esc(r.error)}</div>`;return}
 if(!r.places.length){$("places").innerHTML=`<div class="msg err">No municipality found for "${esc(q)}". Check the spelling, or use the 8-digit municipality key.</div>`;return}
 if(r.places.length===1){pick(r.places[0].osmId,r.places[0].name);return}
 $("places").innerHTML="<small>Which one?</small> "+r.places.map((p,i)=>`<button class="ghost" data-i="${i}">${esc(p.name)} <small>${esc(p.area)}</small></button>`).join(" ");
 document.querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>{const p=r.places[+b.dataset.i];pick(p.osmId,p.name)})};
$("q").onkeydown=e=>{if(e.key==="Enter")$("find").click()};
$("go").onclick=async()=>{const skip=[...document.querySelectorAll("[data-id]")].filter(b=>!b.checked&&!b.disabled).map(b=>b.dataset.id);
 if(files.districts&&!dField){alert("Choose the column holding the district name.");return}
 await api("/api/build",{ags:found.ags,name:found.name,skip,files,districtField:dField});watch("Building "+found.name)};
cities();
api("/api/job").then(j=>{if(j.state==="running")watch("Still working")});
</script></body></html>"""


def main():
    global APP_URL
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8770)
    ap.add_argument("--app-url", default=APP_URL, help="Where the dashboard runs")
    a = ap.parse_args()
    APP_URL = a.app_url
    ThreadingHTTPServer.allow_reuse_address = False  # on Windows the default lets two copies share the port
    print(f"Open http://127.0.0.1:{a.port}  (Ctrl+C to stop)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", a.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
