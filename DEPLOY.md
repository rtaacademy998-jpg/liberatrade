# Deploy — liberatrade.com

โฮสต์: **Cloudflare Pages** (ฟรี) · ตัวดึงราคา: **GitHub Actions cron** (ฟรี)
โดเมนจดที่ **Z.com by GMO**

ทุกอย่างในรีโปพร้อม push แล้ว — เหลือแค่ทำตาม 5 ขั้นตอนนี้

---

## ⚠️ ตัดสินใจก่อน 1 ข้อ: รีโปต้องเป็น Public

GitHub Actions ฟรี **ไม่จำกัดนาที** สำหรับรีโป **public**
แต่รีโป **private** ฟรีแค่ **2,000 นาที/เดือน**

งานเราใช้ ~40 วินาที/รอบ × 288 รอบ/วัน = **~5,800 นาที/เดือน**

| รีโป | ทุก 5 นาที | ค่าใช้จ่าย |
|---|---|---|
| **Public** | ✅ ได้ | ฟรี |
| Private | ❌ เกินโควตา | ~$30/เดือน |
| Private + ทุก 20 นาที | ✅ ได้ | ฟรี (~1,450 นาที/เดือน) |

**แนะนำ: ตั้งเป็น public** — โค้ดหน้าเว็บเปิดเผยอยู่แล้วโดยธรรมชาติ (เป็น static site
ใครเปิด DevTools ก็เห็นหมด) และไม่มีคีย์อะไรอยู่ในรีโป (ตรวจแล้ว)

ถ้าอยากให้ private จริง ๆ ให้แก้ `cron` ใน
[`.github/workflows/update-quotes.yml`](.github/workflows/update-quotes.yml)
เป็น `*/20 * * * *` แล้วแก้ `refreshSeconds` ใน `tools/fetch_quotes.py` เป็น `1200`

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

## 5. เปิด GitHub Actions + ให้สิทธิ์บอท

**5.1 เปิด Actions** — แท็บ **Actions** → **I understand my workflows, go ahead and enable them**

**5.2 ให้สิทธิ์เขียน (ข้อนี้พลาดบ่อยที่สุด)** ⚠️

ไปที่ `https://github.com/USERNAME/liberatrade/settings/actions`
เลื่อนลงหา **Workflow permissions** → เลือก

> ⦿ **Read and write permissions**

แล้วกด **Save**

ถ้าไม่ตั้งข้อนี้ workflow จะดึงราคาได้แต่ **push กลับไม่ได้** ขึ้น error
`Permission to ... denied to github-actions[bot]` แล้วราคาจะไม่อัปเดตบนเว็บเลย

ทดสอบทันทีโดยไม่ต้องรอ cron:
**Actions** → **Update market quotes** → **Run workflow**

ถ้าสำเร็จจะเห็น commit ใหม่ชื่อ `data: quotes ... UTC` แล้ว Cloudflare จะ deploy เองภายใน ~1 นาที

---

## เช็กว่าใช้งานได้จริง

| ตรวจ | ควรเห็น |
|---|---|
| เปิด <https://liberatrade.com> | หน้าแรกขึ้นครบ มีราคาจริง |
| มุมขวาบน | จุดเขียว + เวลาอัปเดต |
| รอ 5 นาที | เวลาเปลี่ยนเอง ราคาที่ขยับกะพริบ |
| แท็บ Actions บน GitHub | มี run ใหม่ทุก ~5 นาที |
| `https://liberatrade.com/data/quotes.json` | `asOf` เป็นเวลาไม่กี่นาทีที่แล้ว |

---

## ข้อควรรู้

**cron ของ GitHub ไม่ตรงเป๊ะ** — เป็น best-effort ช่วงที่คนใช้เยอะอาจช้าไป 10–15 นาที
หน้าเว็บแสดงเวลาอัปเดตล่าสุดเสมอ ผู้ใช้จึงเห็นได้เองว่าข้อมูลเก่าแค่ไหน

**Actions หยุดเองถ้ารีโปเงียบ 60 วัน** — แต่บอทเรา commit ทุก 5 นาที ถือเป็น activity
จึงไม่มีปัญหา

**ตลาดปิด = ไม่มี commit** — workflow ตรวจก่อนว่าข้อมูลเปลี่ยนจริงไหม
ถ้าไม่เปลี่ยนจะข้าม ไม่ commit เปล่า ๆ ให้ deploy ซ้ำ

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
