# Deploy — liberatrade.com

โฮสต์: **Cloudflare Pages** (ฟรี) · ตัวดึงราคา: **GitHub Actions cron** (ฟรี)
โดเมนจดที่ **Z.com by GMO**

ทุกอย่างในรีโปพร้อม push แล้ว — เหลือแค่ทำตาม 5 ขั้นตอนนี้

---

## ลิงก์ตรงทุกหน้าที่ต้องใช้

แทน `USERNAME` ด้วยชื่อ GitHub ของคุณ

| ทำอะไร | ลิงก์ |
|---|---|
| สร้างรีโปใหม่ | <https://github.com/new> |
| **ตั้งสิทธิ์ให้บอท commit ได้** ⚠️ | `https://github.com/USERNAME/liberatrade/settings/actions` |
| เปิด/สั่งรัน workflow | `https://github.com/USERNAME/liberatrade/actions` |
| ดูไฟล์ข้อมูลที่บอทอัปเดต | `https://github.com/USERNAME/liberatrade/blob/main/data/quotes.json` |
| Cloudflare Dashboard | <https://dash.cloudflare.com> |
| Z.com จัดการโดเมน | <https://cp-th.cloud.z.com/Domain/> |

---

## 1. สร้างรีโปแล้ว push

```bash
cd "D:\Web AI"
git remote add origin https://github.com/<ชื่อคุณ>/liberatrade.git
git branch -M main
git push -u origin main
```

### ตั้งค่าตอนสร้างรีโปที่ <https://github.com/new>

| ช่อง | ใส่ |
|---|---|
| Repository name | `liberatrade` |
| Public / Private | **Public** (ดูเหตุผลด้านบน) |
| Add a README file | **ไม่ต้องติ๊ก** — เรามีอยู่แล้ว |
| Add .gitignore | **None** — เรามีอยู่แล้ว |
| Choose a license | ตามใจ |

> ตอน `git push` ครั้งแรก Windows จะเด้งหน้าต่างให้ล็อกอิน GitHub ผ่านเบราว์เซอร์
> (Git Credential Manager) — ล็อกอินตามปกติ **ไม่ต้องสร้าง token เอง**

> รีโป local สร้างและ commit ไว้แล้ว (`git log` ดูได้)
> `config.local.json` อยู่ใน `.gitignore` — คีย์ไม่ขึ้นไปแน่นอน
> `trading-dashboard/` และ `design_handoff_libera_analysts/` ก็ไม่ขึ้นด้วย
> (ถ้าอยากให้ขึ้น ลบสองบรรทัดท้าย `.gitignore`)

## 2. ต่อ Cloudflare Pages

1. สมัคร/เข้า <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. เลือกรีโป `liberatrade`
3. ตั้งค่า build:

   | ช่อง | ใส่ |
   |---|---|
   | Framework preset | **None** |
   | Build command | **เว้นว่าง** |
   | Build output directory | `/` |

4. **Save and Deploy** → ได้ URL ชั่วคราวแบบ `liberatrade.pages.dev` ลองเปิดดูก่อน

## 3. ย้าย DNS มา Cloudflare

Cloudflare Pages ผูกโดเมนหลัก (apex) ได้ก็ต่อเมื่อ DNS อยู่กับ Cloudflare

1. Cloudflare → **Add a site** → พิมพ์ `liberatrade.com` → เลือกแพลน **Free**
2. Cloudflare จะให้ **nameserver 2 ตัว** เช่น
   `xxx.ns.cloudflare.com` และ `yyy.ns.cloudflare.com`
3. ไปที่ Z.com → เมนูซ้าย **"ตั้งค่าการชี้โดเมน"** (หรือแท็บ **DNS**)
   → เปลี่ยน nameserver เป็นสองตัวที่ Cloudflare ให้
4. รอ DNS propagate (ปกติ 10 นาที – 24 ชม.)

## 4. ผูกโดเมนกับ Pages

Cloudflare → **Workers & Pages** → โปรเจกต์ → **Custom domains** → **Set up a domain**

เพิ่มทั้งสองอัน:
- `liberatrade.com`
- `www.liberatrade.com`

Cloudflare จะสร้าง DNS record และออก **SSL ให้ฟรีอัตโนมัติ**

## 5. ตัวดึงราคาทุก 5 นาที — Cloudflare Worker

> **ทำไมไม่ใช้ GitHub Actions?** ลองแล้วครับ — cron `*/5` **ไม่ยิงเลยแม้แต่ครั้งเดียวใน 79 นาที**
> ตั้งค่าถูกหมด (repo public, branch main, workflow active) แต่ GitHub throttle
> ช่วงสั้น ๆ หนักมาก มันคือ best-effort ไม่ใช่การรับประกัน
> **Cloudflare cron ยิงตรงเวลาจริง** ตัวดึงราคาจึงย้ายมาที่นี่
> (workflow บน GitHub ยังอยู่ แต่เป็นปุ่มกดเองเท่านั้น)

**ไม่ต้องติดตั้ง Node.js** — ทำผ่านหน้าเว็บ Cloudflare ได้ทั้งหมด

### 5.1 สร้างที่เก็บข้อมูล (KV)

Cloudflare → **Storage & Databases** → **KV** → **Create instance**
ตั้งชื่อ `liberatrade-quotes` → **Add**

### 5.2 สร้าง Worker

**Workers & Pages** → **Create** → แท็บ **Workers** → **Start with Hello World** → ตั้งชื่อ
`liberatrade-quotes` → **Deploy** → กด **Edit code**

ลบโค้ดตัวอย่างทิ้งทั้งหมด แล้ววางเนื้อไฟล์ [`worker/src/index.js`](worker/src/index.js)
ลงไปแทน → **Deploy**

### 5.3 ผูก KV เข้ากับ Worker

Worker → **Settings** → **Bindings** → **Add** → **KV namespace**

| ช่อง | ใส่ |
|---|---|
| Variable name | `QUOTES` |
| KV namespace | `liberatrade-quotes` |

### 5.4 ตั้งรหัสสำหรับสั่งรีเฟรชเอง

Worker → **Settings** → **Variables and Secrets** → **Add** → ชนิด **Secret**

| ช่อง | ใส่ |
|---|---|
| Name | `REFRESH_TOKEN` |
| Value | สุ่มยาว ๆ เช่น `lib-9f3a7c2e8b4d` |

### 5.5 ตั้ง cron ทุก 5 นาที

Worker → **Settings** → **Trigger Events** → **Add** → **Cron Trigger**
ใส่ `*/5 * * * *` → **Add**

### 5.6 ดึงข้อมูลรอบแรกทันที (ไม่ต้องรอ cron)

เปิดในเบราว์เซอร์ (เปลี่ยน token เป็นของคุณ):

```
https://liberatrade-quotes.<ชื่อบัญชี>.workers.dev/data/refresh?token=lib-9f3a7c2e8b4d
```

ควรได้ `{"updated": 19, "total": 19, "failures": []}`

เช็กสุขภาพได้ที่ `/data/health` — ต้องได้ `"ok": true` และ `"symbols": 19`

### 5.7 ให้เว็บอ่านจาก Worker

หลังโดเมนอยู่บน Cloudflare แล้ว (ข้อ 3–4)

Worker → **Settings** → **Domains & Routes** → **Add** → **Route**

| ช่อง | ใส่ |
|---|---|
| Route | `liberatrade.com/data/*` |
| Zone | `liberatrade.com` |

Route ของ Worker จะมาก่อน Pages เสมอ ดังนั้น `/data/*` จะถูกเสิร์ฟจาก KV (สดทุก 5 นาที)
ส่วนไฟล์ `data/*.json` ในรีโปกลายเป็นแค่ค่าสำรองตอนยังไม่มี Worker

---

## เช็กว่าใช้งานได้จริง

| ตรวจ | ควรเห็น |
|---|---|
| เปิด <https://liberatrade.com> | หน้าแรกขึ้นครบ มีราคาจริง |
| มุมขวาบน | จุดเขียว + เวลาอัปเดต |
| รอ 5 นาที | เวลาเปลี่ยนเอง ราคาที่ขยับกะพริบ |
| `https://liberatrade.com/data/health` | `"ok": true`, `"symbols": 19`, `ageMinutes` < 5 |
| `https://liberatrade.com/data/quotes.json` | `asOf` เป็นเวลาไม่กี่นาทีที่แล้ว |
| Worker → **Logs** | มี log `refreshed 19/19` ทุก 5 นาที |

---

## ข้อควรรู้

**โควตา Cloudflare ฟรี** — Workers ฟรี 100,000 requests/วัน · cron 288 ครั้ง/วันใช้แค่ 288
ที่เหลือเป็นคนเข้าเว็บ เหลือเฟือ

**ดึงพลาดบางตัว = คงราคาเดิม** — ตัวนั้นจะติดธง `stale` แต่ราคายังอยู่บนจอ
ดูได้จาก `/data/health` ว่ามีตัวไหน stale บ้าง

**Worker มี retry 3 ครั้ง** ต่อสินทรัพย์ เพราะ gold-api เคยล้มชั่วคราวบนคลาวด์

**`_headers` สำคัญมาก** — สั่งไม่ให้ Cloudflare cache ไฟล์ `data/*`
ถ้าลบไฟล์นี้ ราคาจะค้างเพราะ CDN cache ไว้

---

## 🚨 ก่อนเริ่มเก็บเงินค่าสมาชิก

ตอนนี้เปิดทดสอบ **ไม่เก็บเงิน** — ใช้ Yahoo Finance + gold-api ได้

**แต่ Yahoo ห้ามนำข้อมูลไปเผยแพร่ต่อเชิงพาณิชย์** วันที่เริ่มเก็บ $189/$369 จริง
ต้องย้ายไปฟีดที่มีสัญญาก่อน:

| ฟีด | ราคาเริ่มต้น | ครอบคลุม |
|---|---|---|
| Twelve Data | ~$29/เดือน | หุ้น, ดัชนี, FX, คริปโต, ทอง |
| Finnhub | ~$50/เดือน | หุ้น, FX, คริปโต |
| Polygon | ~$29/เดือน | หุ้น, ดัชนี, FX, คริปโต |
| EOD Historical | ~$20/เดือน | ครบทุกอย่าง |

**แก้แค่ตาราง `SOURCES` ใน [`tools/fetch_quotes.py`](tools/fetch_quotes.py)** ส่วนอื่นไม่ต้องแตะ

และอย่าลืมเรื่องอื่นก่อนเก็บเงินจริง:
- **บังคับสิทธิ์ฝั่งเซิร์ฟเวอร์** — ตอนนี้การเบลอเนื้อหาเป็นแค่ CSS ใครเปิด DevTools ก็อ่านได้
- ระบบชำระเงิน (PromptPay / บัตร) + ใบกำกับภาษี
- นโยบายความเป็นส่วนตัว + เงื่อนไขการใช้บริการ
- คำเตือน "ไม่ใช่คำชี้ชวนการลงทุน" (มีบนหน้าเว็บแล้ว)
