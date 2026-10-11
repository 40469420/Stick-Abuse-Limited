"""Flydigi Apex 5 USB bridge (stdio JSON-RPC) — READ and WRITE capable.

Speaks interrupt-OUT on the 0xFFA0 collection (report 3 out / 4 back),
which node-hid/Electron-WebHID cannot reliably do. Electron main spawns
this and talks JSON lines on stdin/stdout.

Request:  {"id": N, "op": "open"|"send"|"collect"|"close", ...}
Reply:    {"id": N, "ok": true|false, ...}

  open:    {"vid": int, "pid": int, "usagePage": int} -> {ok}
  send:    {"report": [ints], "expect": cmdByte, "timeoutMs": n}
           -> {ok, "frame": [ints]} (first input frame with [1,2]==[5A,A5]
              and [3]==expect)
  collect: {"report": [...], "expect": cmdByte, "count": n, "timeoutMs": n}
           -> {ok, "frames": [[ints], ...]} (stops early once `count`
              DISTINCT index bytes [5] are seen — see readStore)
  close:   -> {ok}

Frames are raw report bytes INCLUDING the leading report id.
Only stdlib + hidapi (pip install hidapi) required.
"""
import json
import sys
import time

try:
    import hid
except Exception as exc:  # pragma: no cover
    print(json.dumps({"ready": False, "error": f"hidapi import failed: {exc}"}), flush=True)
    sys.exit(2)

print(json.dumps({"ready": True}), flush=True)

HANDLE = None


def respond(rid, **kw):
    msg = {"id": rid, "ok": True}
    msg.update(kw)
    print(json.dumps(msg), flush=True)


def fail(rid, error):
    print(json.dumps({"id": rid, "ok": False, "error": str(error)}), flush=True)


def matches(frame, expect):
    return len(frame) >= 4 and frame[1] == 0x5A and frame[2] == 0xA5 and frame[3] == expect


def do_open(args):
    global HANDLE
    do_close({})
    vid = int(args["vid"])
    pid = int(args["pid"])
    page = int(args.get("usagePage", 0))
    cands = [d for d in hid.enumerate(vid, pid)
             if page == 0 or d.get("usage_page") == page]
    if not cands:
        raise RuntimeError("no matching HID interface (close Space Station — it locks the pad)")
    last = None
    for cand in cands:
        h = hid.device()
        try:
            h.open_path(cand["path"])
            h.set_nonblocking(True)
            HANDLE = h
            return {"path": cand["path"].decode("utf-8", "replace")[-40:]}
        except Exception as exc:
            last = exc
            try:
                h.close()
            except Exception:
                pass
    raise RuntimeError(f"open failed: {last}")


def do_close(_args):
    global HANDLE
    if HANDLE is not None:
        try:
            HANDLE.close()
        except Exception:
            pass
        HANDLE = None
    return {}


def do_send(args):
    if HANDLE is None:
        raise RuntimeError("not open")
    report = bytes(args["report"])
    expect = int(args["expect"])
    timeout = float(args.get("timeoutMs", 3000)) / 1000.0
    HANDLE.write(report)
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            raw = HANDLE.read(64, timeout_ms=150)
        except Exception:
            break
        if not raw:
            continue
        frame = bytes(raw)
        if matches(frame, expect):
            return {"frame": list(frame)}
    raise RuntimeError(f"cmd 0x{expect:02X} timed out — close Space Station (it holds the handle) and retry")


def do_collect(args):
    if HANDLE is None:
        raise RuntimeError("not open")
    report = bytes(args["report"])
    expect = int(args["expect"])
    want = int(args.get("count", 42))
    timeout = float(args.get("timeoutMs", 15000)) / 1000.0
    HANDLE.write(report)
    frames = {}
    t0 = time.time()
    while time.time() - t0 < timeout and len(frames) < want:
        try:
            raw = HANDLE.read(64, timeout_ms=200)
        except Exception:
            break
        if not raw:
            continue
        frame = bytes(raw)
        if matches(frame, expect) and len(frame) >= 8 and frame[5] not in frames:
            frames[frame[5]] = list(frame)
    if len(frames) < want:
        raise RuntimeError(f"short read: {len(frames)}/{want} chunks")
    return {"frames": [frames[i] for i in sorted(frames)]}


OPS = {"open": do_open, "close": do_close, "send": do_send, "collect": do_collect}

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        msg = json.loads(line)
    except Exception as exc:
        print(json.dumps({"id": 0, "ok": False, "error": f"bad json: {exc}"}), flush=True)
        continue
    rid = msg.get("id", 0)
    try:
        respond(rid, **OPS[msg["op"]](msg))
    except KeyError:
        fail(rid, f"unknown op {msg.get('op')!r}")
    except Exception as exc:
        fail(rid, exc)
