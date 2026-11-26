# چالشها و راهحلهای ماژول Tasks

## دامنه، روش و برچسبهای اطمینان

این سند چالشهای واقعی ثبتشده در مسیر پیادهسازی ماژول Tasks و قابلیت اشتراک workspace را مستند میکند. هر چالش دقیقاً در **نه بخش** توضیح داده میشود:

1. مشکل 2. علائم 3. ریشه 4. بررسی 5. راهحل 6. فایلها/توابع تغییریافته 7. تأیید 8. آموختهها 9. پیشگیری

برچسبهای وضعیت:

- **تأییدشده**: ریشه و راهحل مستقیماً در کد منبع / مهاجرت / شواهد کاربردی قابل مشاهدهاند.
- **احتمالی**: نوع یا پیام خطا بهصورت شفاهی گزارش شده یا از روی کد استنباط شده است؛ متن دقیق پیام خطا در اختیار نیست. در این موارد صریحاً مینویسیم: «نوع/پیام خطا بهصورت شفاهی گزارش شده یا از کد استنباط شده است».

**سابقه اجرایی نگارنده:** این مستند بر اساس شواهد تأییدشده ارائهشده توسط جلسه کاری قبل و خواندن کد منبع بهصورت فقطخواندنی تهیه شده است. نگارنده **هیچ تست، مهاجرت، دستور git، نصب وابستگی یا تغییر سورس اجرا نکرده است**. مواردی که بهعنوان «تأیید شده» علامت خوردهاند، یا در کد فعلی قابل مشاهدهاند یا از نتایج ثبتشده همان جلسه نقل شدهاند.

---

# بخش الف — مطالعه موردی کامل: حادثه Phase 3.1 (CORS گیجکننده در برابر TypeError واقعی)

**وضعیت: تأییدشده (علائم، ریشه، متن دقیق پیام خطا، کد رفع و نتایج بررسی کاربردی همگی در شواهد موجوداند). متن ثبتشدهٔ خطا: `TypeError: _commit() missing 1 required keyword-only argument: 'conflict_status'`.**

## ۱. مشکل

پس از پیادهسازی لایه اشتراکtask با workspace (`task_workspaces`)، سه عملیات مدیریتی اشتراک بهصورت `HTTP 500` شکست میخوردند:

- `POST /api/tasks/{task_id}/workspaces/{workspace_id}` → `service.attach_task_to_workspace()`
- `DELETE /api/tasks/{task_id}/workspaces/{workspace_id}` → `service.detach_task_from_workspace()`
- `PATCH /api/tasks/{task_id}/workspaces/{workspace_id}` → `service.update_task_workspace_permission()`

در هر سه تابع، فراخوانی `_commit(db, *, conflict_detail, conflict_status)` بدون آرگومان `conflict_status` انجام میشد. امضای فعلی تابع (`service.py`) چنین است:

```python
def _commit(db: Session, *, conflict_detail: str, conflict_status: int) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=conflict_status, detail=conflict_detail)
```

پیش از اصلاح، این سه محل تنها `conflict_detail` را ارسال میکردند و در نتیجه هنگام رسیدن به خط فراخوانی، خطای ثبتشدهٔ زیر رخ میداد:

```text
TypeError: _commit() missing 1 required keyword-only argument: 'conflict_status'
```

مهم: خطا حتی زمانی رخ میداد که هیچ `IntegrityError` وجود نداشت، چون پارامتر الزامی در سطح Python جور نمیشد.

## ۲. علائم

- مرورگر پیامی شبیه «No Access-Control-Allow-Origin» نمایش میداد (این متن دقیقاً همان چیزی است که در شواهد ثبت شده).
- کاربران و توسعهدهندگان ابتدا گمان میکردند مشکل از پیکربندی CORS در FastAPI / پروکسی معکوس است.
- در حالی که سرویس در واقع `@router.post(...)`, `@router.patch(...)`, `@router.delete(...)` را اجرا میکرد و به `500` پاسخ میداد، لایه خطای عمومی 500 فاقد هدرهای CORS بود؛ در نتیجه مرورگر هدر CORS پاسخ خطا را مسئولیت خطا اعلام میکرد و خطای واقعی پایتون را پنهان میساخت.
- عملیات خواندن (`GET /workspaces`, `GET /api/tasks/{id}`) سالم بودند، که نشان میداد مشکل مربوط به مسیرهای mutation است نه احراز هویت یا CORS کلی.

## ۳. ریشه

سه فراخوانی ناقص `_commit` در `service/task/service.py`:

| تابع | نیاز به آرگومان | وضعیت قبل | کد فعلی (پس از رفع) |
| --- | --- | --- | --- |
| `attach_task_to_workspace` | `conflict_status` | حذف شده | `conflict_status=status.HTTP_409_CONFLICT` |
| `detach_task_from_workspace` | `conflict_status` | حذف شده | `conflict_status=status.HTTP_400_BAD_REQUEST` |
| `update_task_workspace_permission` | `conflict_status` | حذف شده | `conflict_status=status.HTTP_400_BAD_REQUEST` |

علت سطحیتر: هنگام اضافه شدن امضای keyword-only به `_commit`، تنها محلهای قدیمیتر بهروز شدند و سه تابع جدیده به همان الگوی قدیمی (`conflict_detail` فقط) نوشته شدند. چون `TypeError` قبل از ورود به بلوک `except IntegrityError` رخ میداد، حتی مسیر موفقیت هم شکست میخورد.

## ۴. بررسی

1. مشاهده پاسخ 500 در مرورگر و تفسیر اشتباه «No Access-Control-Allow-Origin» بهعنوان علت.
2. بررسی لاگ سمت سرور و شناسایی استثنای `TypeError` بهجای خطای CORS (خطای CORS صرفاً عارضه لایه خطای عمومی 500 بود).
3. مقایسه سه تابع جدید با سایر توابع سرویس که `_commit` را بهدرستی با `conflict_status` فراخوانی میکنند (مثلاً `create_task` با `400`, `assign_user` با `409`, `attach_label` با `409`).
4. جستوجویstatic الگوی فراخوانی `_commit` بدون `conflict_status` در کل ماژول.
5. تصمیم در مورد کد وضعیت مناسب برای هر عملیات بر اساس قراردادهای موجود (بخش بعد).
6. اعمال اصلاح و سپس بررسی مجددstatic و کاربردی.

## ۵. راهحل

اضافه شدن صریح `conflict_status` به هر سه فراخوانی، با منطق زیر:

- **`attach_task_to_workspace` → `409 Conflict`**: با قرارداد «duplicate attach» هماهنگ است. مشروعیت تکرار در کد (`existing is not None` → `attached=false`) و الگوی `assign_user` / `attach_label` (هر دو `409`) پشتیبانی میکند. اگر دو درخواست همزمان به همان جفت `(task_id, workspace_id)` برسند، تضاد کلید مرکب باید بهعنوان `409` تفسیر شود، نه `400`.
- **`detach_task_from_workspace` → `400 Bad Request`**: پیروی از قرارداد حذف/عملیات معمولی در این ماژول (مانند `delete_task`, `detach_label`, `remove_assignment` با کدهای 400/204). حذف انجمن(original هم `400` است)، بنابراین تضاد انگاری در حذف نباید `409` باشد.
- **`update_task_workspace_permission` → `400 Bad Request`**: یک بهروزرسانی معمولی تکفیلدی است (مانند `update_task`, `set_parent_task`) و هیچ معنای «منبع تکراری» ندارد.

## ۶. فایلها/توابع تغییریافته

- `service/task/service.py`:
  - `attach_task_to_workspace()` — اضافه شدن `conflict_status=status.HTTP_409_CONFLICT`
  - `detach_task_from_workspace()` — اضافه شدن `conflict_status=status.HTTP_400_BAD_REQUEST`
  - `update_task_workspace_permission()` — اضافه شدن `conflict_status=status.HTTP_400_BAD_REQUEST`
- فایلهای مرتبط در همان بررسی (بدون نیاز به تغییر منطقی صریح): `service/task/router.py`, `service/task/schemas.py`, `service/workspace/models.py`, `service/workspace/repository.py`، و frontend شامل `web/app/task/api.js`, `TaskDetailPanel.jsx`, `TaskShareDialog.jsx` (همگی در وضعیت کاری جداگانه قرار داشتند و توسط نگارنده تغییر نخواستند).

## ۷. تأیید

**بررسیstatic (نتایج ثبتشده در جلسه رفع خطا):**

| بررسی | نتیجه |
| --- | --- |
| AST parse تمام فایلهای پایتون مربوط | pass |
| اسکن AST برای فراخوانی `_commit` فاقد `conflict_status` | صفر مورد |
| `git diff --check` | pass |

**بررسی کاربردی با Task آزمایشی یکبارمصرف (QA Task):**

| # | عملیات | پاسخ | نتیجه مشاهدهشده |
| --- | --- | --- | --- |
| ۱ | ایجاد Task آزمایشی | 201 | دقیقاً một انجمن original وجود دارد (`is_original=true`, `permission_level=editor`) |
| ۲ | اشتراک workspace دوم بهعنوان viewer | 201 | `attached=true`، انجمن دوم ایجاد شد |
| ۳ | اشتراک مجدد همان workspace با editor | 201 | `attached=false`، هیچ ردیف تکراری ایجاد نشد، سطح تغییر نکرد |
| ۴ | PATCH سطح به editor | 200 | سطح انجمن مشترک بهروز شد |
| ۵ | PATCH سطح به viewer | 200 | سطح دوباره بهروز شد |
| ۶ | DELETE انجمن original | 400 | انجمن اصلی محافظت شد و حذف نگردید |
| ۷ | DELETE انجمن workspace دوم | 204 | انجمن مشترک حذف شد |
| ۸ | GET Task | 200 | Task همچنان وجود دارد و سالم است |
| ۹ | DELETE Task آزمایشی | 204 | پاکسازی کامل شد؛ اثر باقی نماند |

**محدودیت صریح:** `pytest` در محیط در دسترس نبود و **تستها اجرا نشدند**؛ بنابراین تأیید تنها static و کاربردی (روی داده یکبارمصرف) بوده است، نه خودکار.

## ۸. آموختهها

- یک `TypeError` ساده در سرویس میتواند خود را بهشکل مشکل CORS در مرورگر نشان دهد، چون handler عمومی 500 هدرهای CORS را اضافه نمیکند. **علت ظاهری شبکهای لزوماً علت واقعی نیست.**
- امضای keyword-only با پارامترهای الزامی، در صورت فراموشی در یک محل، حتی مسیر موفقیت را میشکند؛ الگوی `_commit` باید یکسان در تمام mutationها باشد.
- کد وضعیت تضاد نباید خودسرانه انتخاب شود: `409` جایی است که معنای «منبع از قبل وجود دارد / race» مطرح است؛ `400` جایی است که عملیات معمولی نامعتبر است.
- وجود `[attached]` در پاسخ به frontend اجازه میدهد تکرار عمدی را بهعنوان پیام «Already shared» نمایش دهد، در حالی که `409` تنها برای race واقعی باقی میماند.

## ۹. پیشگیری

- اضافه کردن آزمون unit/API برای تک تک mutationهای اشتراک (پوشش موفقیت، تکرار، انجمن original، race) در محیطی که `pytest` در دسترس باشد.
- اسکن static در CI: هر فراخوانی `_commit` باید دارای هر دو کلید `conflict_detail` و `conflict_status` باشد (همان اسکن AST که بهصورت دستی انجام شد، قابل خودکارسازی است).
- اضافه کردن هدرهای CORS به handler خطای 500 (با حفظ جزئیات خطا در لاگ سرور) تا علائمnetwork گیجکننده نشود.
- نگهداری جدول «قرارداد کد وضعیت» در کنار router تا توسعهدهنده هنگام اضافه کردن endpoint جدید بداند 400/403/404/409 را کجا Apply کند.

---

# بخش ب — چالشهای مهاجرت و مدلداده

## ب.۱ دو head در زنجیره مهاجرت و ادغام 033

**وضعیت: تأییدشده برای وجود دو شاخه و فایل ادغام؛ نقطه شروع اختلاف (گزارش «head در 017») بهصورت شفاهی است و متن دقیق خطا موجود نیست.**

### ۱. مشکل
زنجیره Alembic دارای دو head موازی بود: شاخه projekt/workspace و شاخه دنباله Task (مربوط به چکلیست). وجود دو head باعث میشود اجرای `alembic upgrade head` نامشخص باشد یا مهاجرت جدید روی یکی از شاخهها قرار بگیرد و دیگری اعمال نشود.

### ۲. علائم
خطای مربوط به «multiple head» هنگام اجرایUpgrade (نوع/پیام خطا بهصورت شفاهی گزارش شده یا از کد استنباط شده است)؛ لزوم دستکاری دستی قبل از ادغام.

### ۳. ریشه
دو مهاجرت بهطور مستقل از یک نقطه مشترک (در.report شفاهی حدود 017) منشعب شدند و هیچکدام `down_revision` دیگری را نداشتند.

### ۴. بررسی
خواندن فایل `alembic/versions/033_merge_heads.py` نشان میدهد:

```python
revision = "033_merge_heads"
down_revision = ("032", "020_task_checklist")
```

یعنی شاخهها در وضعیت فعلی `032` و `020_task_checklist`اند و 033 صرفاً آنها را به یک head واحد متصل میکند.

### ۵. راهحل
ایجاد مهاجرت merge-only `033_merge_heads` بدون هیچ تغییر schema یا data (`upgrade()` و `downgrade()` خالی)، سپس قرار دادن `034_task_workspace_sharing` با `down_revision = "033_merge_heads"`.

### ۶. فایلها/توابع تغییریافته
`alembic/versions/033_merge_heads.py` (جدید)، `alembic/versions/034_task_workspace_sharing.py` (جدید).

### ۷. تأیید
خواندن فایلها و برابر بودن `down_revision` با دو شاخه؛ نتایج اجرای مهاجرت توسط نگارنده بررسی نشد (pytest/مهاجرت اجرا نشد).

### ۸. آموختهها
merge migrations باید خالی باشند؛ هرگونه تغییر data/schema در merge باعث میشود نتیجه به ترتیب اجرای شاخهها وابسته شود.

### ۹. پیشگیری
بررسی `alembic heads` قبل از ایجاد هر مهاجرت جدید و اضافه کردن چک CI مبنی بر «تنها یک head».

---

## ب.۲ مهاجرت 034: backfill workspace اصلی با توقف در صورت ابهام

**وضعیت: تأییدشده (منطق دقیق در کد مهاجرت قابل خواندن است).**

### ۱. مشکل
با اضافه شدن ستون `is_original` به `task_workspaces` لازم بود مشخص شود کدام انجمن برای هرtask از ابتدا «اصلی» بوده است. نمیشد یک انجمن دلخواه را بدون سابقه انتخاب کرد، چون حذف/لغو اشتراک به انجمن اصلی وابسته است.

### ۲. علائم
خطر آسیبپذیر شدن «انجمن اصلی» و محافظت اشتباه از یک workspace مشترک (با عواقب امنیتی در `_admin_task` و `delete_task`).

### ۳. ریشه
داده قدیمی فاقد پرچم `is_original` بود و تنها ردیفهای انجمن وجود داشتند.

### ۴. بررسی
تابع `_resolve_original_workspace` در `034_task_workspace_sharing.py` سه منبع شواهد را به ترتیب first امتحان میکند:
1. `projects.workspace_id` وقتیtask متعلق به پروژهای است و آن workspace در انجمنها وجود دارد؛
2. workspace ثبتشده در ردیف `project_activities` با `event_type='task.created'` (در صورت وجود جدول/ستون)؛
3. تنها انجمن موجودtask.

### ۵. راهحل
- اضافه شدن ستونهای `is_original`, `permission_level` (پیشفرض `viewer`), `shared_by_user_id` (FK به users, `ON DELETE SET NULL`) بهصورت guard شده توسط `_has_column`.
- backfill براساس الویت شواهد؛ انجمن اصلی `editor` و بقیه `viewer` میشوند.
- در صورت تعارض شواهد یا نبود انجمن، مهاجرت با `RuntimeError` متوقف میشود و شناسهtaskهای مشکلدار را چاپ میکند (`Ambiguous original workspace; migration stopped: ...`).
- چک نهایی: هرtask دقیقاً یک انجمن original دارد (`GROUP BY ... HAVING count(*) <> 1`)؛ قید `ck_task_workspaces_permission_level`, ایندکس `uq_task_workspaces_original_task` (partial unique on `is_original`) و `ix_task_workspaces_shared_by_user_id` ایجاد میشود.
- `downgrade()` عمداً خالی است (forward-only foundation migration).

### ۶. فایلها/توابع تغییریافته
`alembic/versions/034_task_workspace_sharing.py`: `_has_table`, `_has_column`, `_has_index`, `_has_check_constraint`, `_resolve_original_workspace`, `upgrade`, `downgrade`.

### ۷. تأیید
خواندن کد مهاجرت؛ تستهای `service/tests/test_task_workspace_sharing.py` شامل `test_created_task_has_one_original_editor_association`, `test_second_workspace_association_defaults_to_viewer`, `test_original_association_cannot_be_removed_or_downgraded` و چک `tasks_without_single_original()` نوشته شدهاند، ولی توسط نگارنده اجرا نشدند (pytest unavailable).

### ۸. آموختهها
backfill نباید حدس بزند: توقف با لیست شناسهها بهتر از انتخاب اشتباهی است که بعداً politicianाई امنیتی ایجاد کند. وابستگی به `{project workspace, creation activity, sole association}` ترتیب اعتبار شواهد را مشخص میکند.

### ۹. پیشگیری
نوشتن تستMigration روی یک کپی disposable از DB و حفظ چک `exactly one original` در تستهای هر تغییر آینده درtask sharing.

---

## ب.۳ چکلیست بهصورت جدول رابطهای (020) نه JSON

**وضعیت: تأییدشده.**

### ۱. مشکل
انتخاب ساختار ذخیره چکلیست میتوانست بهصورت یک ستون JSON رویtask باشد؛ چنین طراحیای querying، شمارش و reorder را دشوار میکرد.

### ۲. علائم
در صورت JSON بودن، محاسبه `checklist_total` / `checklist_completed` نیاز به خواندن و پردازش تمامtaskها در Python داشت و ایندکسposition ممکن نبود.

### ۳. ریشه
نیاز به نگهداری آیتمها با ترتیب پایدار و وابستگی بهtask.

### ۴. بررسی
مهاجرت `020_task_checklist_items.py` جدول `task_checklist_items` را با ستونهای `id`, `task_id` (FK, `ON DELETE CASCADE`), `title` (200), `is_completed`, `position` (BigInteger) و timestamps ایجاد میکند؛ ایندکس `(task_id, position, id)`.

### ۵. راهحل
نگهداری چکلیست بهعنوان ردیفهای رابطهای؛ شمارشها توسط `_checklist_counts_for_tasks` با `GROUP BY` و `CASE` محاسبه و توسط `populate_checklist_counts` بهtaskها متصل میشود. `reorder_checklist_items` تنها لیست `item_ids` را میگیرد وpositionها را در سرویس بازمینویسد.

### ۶. فایلها/توابع تغییریافته
`alembic/versions/020_task_checklist_items.py`, `service/task/repository.py` (`_checklist_counts_for_tasks`, `populate_checklist_counts`), `service/task/service.py` (CRUD چکلیست)، `web/app/task/TaskChecklistSection.jsx`.

### ۷. تأیید
خواندن مهاجرت و توابع مربوطه؛ تست حذفTask و بقای چکلیستtask دیگر (`test_task_deletion_keeps_other_task_checklist_intact`) موجود است ولی اجرا نشد.

### ۸. آموختهها
خودداری از JSON برای مجموعههایی که نیاز به مرتبسازی، شمارش و FK cascade دارند خودداری شود.

### ۹. پیشگیری
هر feature جدید مجموعهای (labels, checklist, assignments) باید از همان الگوی جدول رابطهای + ایندکس + COALESCE count پیروی کند.

---

# SECTION ج — چالشهای بکاند و API

## ج.۱ خطای اعتبارسنجی پاسخ: فیلدهای position در `attach_task_workspaces`

**وضعیت: تأییدشده در کد فعلی؛ نوع/پیام خطا («ResponseValidationError», کمبود فیلد position) بهصورت شفاهی گزارش شده یا از کد استنباط شده است.**

### ۱. مشکل
پس از اضافه شدن قابلیت kanban و priority board، endpoint لیستtaskها فیلدهای position را در پاسخ نداشت درحالیکه `TaskListResponse` / `TaskResponse` آنها را انتظار داشتند و frontend برای مرتبسازی به آنها نیاز داشت.

### ۲. علائم
خطای اعتبارسنجی پاسخ (ResponseValidationError) در لایه Pydantic/FastAPI هنگام برگشت لیست (متن دقیق خطا بهصورت شفاهی گزارش شده یا از کد استنباط شده است)؛ مشاهده فلکر/ناپدید شدنpositionها در کانبان.

### ۳. ریشه
تابع `attach_task_workspaces` تنها فیلدهای قدیمیtask (`id`, `title`, `status`, `priority`, dates, `created_by`, `project_id`, timestamps, `workspaces`) را populate میکرد و فیلدهایposition و شمارش چکلیست را اضافه نکرده بود؛ سپس دیکت ساختهشده مستقیماً در `response_model` قرار میگرفت.

### ۴. بررسی
مقایسه خروجی `attach_task_workspaces` با فیلدهای مورد نیاز `TaskSummary` / `TaskResponse` و با استفاده frontend (`sortColumnItems` در TaskBoardView براساس `position` / `priority_position`).

### ۵. راهحل
اضافه شدن صریح:

```python
"position": getattr(t, "position", 0) or 0,
"priority_position": getattr(t, "priority_position", 0) or 0,
"checklist_total": int(getattr(t, "checklist_total", 0) or 0),
"checklist_completed": int(getattr(t, "checklist_completed", 0) or 0),
```

همچنین `serialize_task` همان فیلدها را برای تکtask برمیگرداند.

### ۶. فایلها/توابع تغییریافته
`service/task/service.py`: `attach_task_workspaces`, `serialize_task`; مصرفکننده: `web/app/task/TaskBoardView.jsx`, `web/app/task/hooks/useTasks.js`.

### ۷. تأیید
خواندن کد فعلی نشان میدهد فیلدها موجوداند؛ تست اجرا نشد.

### ۸. آموختهها
وقتی router یک دیکت دستساز را به `response_model` میدهد، هر فیلدresponseModel باید صریحاً در دیکت باشد؛ با `getattr(..., default)` میتوان از شکست روی ردیفهای قدیمی جلوگیری کرد.

### ۹. پیشگیری
تست قرارداد response (contract test) برای لیست و تکtask؛ نگهداری فهرست فیلدها در یک مکان مشترک (`TaskSummary`) و reuse آن در serializeها.

---

## ج.۲ اعلان ایجادtask: گیرندگان deduped

**وضعیت: تأییدشده (کد صریح با `set[int]`).**

### ۱. مشکل
هنگام ایجادtask، اگر سازنده خودش assignee هم بود، خطر ایجاد دو اعلان یکسان برای همان کاربر وجود داشت.

### ۲. علائم
دریافت اعلان تکراری «New task created» توسط همان کاربر.

### ۳. ریشه
پیمایش جداگانه `{actor_id}` و لیست assignees بدون یکسانسازی.

### ۴. بررسی
خواندن `_create_task_created_notifications` در سرویس.

### ۵. راهحل
```python
recipient_ids: set[int] = {actor_id}
for assignment in getattr(task, "assignments", []) or []:
    if getattr(assignment, "assignment_status", None) == "active":
        recipient_ids.add(assignment.assigned_user_id)
```
سپس درج بهFROMSorted `sorted(recipient_ids)` با `type="task_created"` و `task_id`.

### ۶. فایلها/توابع تغییریافته
`service/task/service.py`: `_create_task_created_notifications`, فراخوانی در `create_task` و `create_subtask`.

### ۷. تأیید
خواندن کد؛ تست اجرا نشد.

### ۸. آموختهها
dedup براساس شناسه کاربر، نه براساس ردیف تخصیص، لازم است چون mehrere تخصیص میتواند به یک کاربر تعلق داشته باشد.

### ۹. پیشگیری
استفاده از`set` برای تمام لیستهای گیرنده اعلان و اضافه کردن constraint منحصربهفرد در صورت نیاز به سطح DB.

---

## ج.۳ نبود محیط pytest

**وضعیت: تأییدشده (گزارش صریح).**

### ۱. مشکل
امکان اجرای تستهای خودکار در محیط کار وجود نداشت (`pytest` unavailable).

### ۲. علائم
عدم اجرای `service/tests/test_task_workspace_sharing.py` و سایر تستها؛ تکیه بر بررسیstatic و سناریو کاربردی دستی.

### ۳. ریشه
نصب نبودن pytest / وابستگیهای تست در محیط جاری.

### ۴. بررسی
تلاش/بررسی دسترسپذیری ابزار و عدم امکان اجرا (طبق شواهد جلسه قبل).

### ۵. راهحل
جایگزینی موقت با: AST parse، اسکن AST مربوط به `_commit`، `git diff --check` و سناریو QA یکبارمصرف رویTask موقت؛ مستندسازی صریح اینکه تستها اجرا نشدند.

### ۶. فایلها/توابع تغییریافته
هیچ فایل سورس تغییر نخواست؛ تنها مستندسازی وضعیت.

### ۷. تأیید
همان جدول تأییدsection الف.

### ۸. آموختهها
«اجرا نشد» باید صریحاً در گزارش ذکر شود؛ نباید بر اساس نوشته شدن تست، ادعای موفقیت آن کرد.

### ۹. پیشگیری
آمادهسازی محیط تست disposable (دیتابیس موقتی مطابق `service/tests/conftest.py`) قبل از شروع فاز بعدی و اضافه کردن pytest به الزامات محیط توسعه.

---

## ج.۴ متغیر `parent` تعریفنشده در `create_subtask` پس از تغییر مجوز Phase 2

**وضعیت: تأییدشده توسط بررسی کد؛ رفتار در زمان اجرا تست نشده است (NOT TESTED). این شکاف واقعی در حین بررسی مستندات کشف شد و تا زمان نوشتن این سند اصلاح نشده است (وظیفه جاری اجازه تغییر سورس را نمیدهد).**

### ۱. مشکل
در `service/task/service.py::create_subtask`، ویرایش مجوزPhase 2، فراخوانی قدیمی `parent, role = _visible_task(...)` را به `_admin_task(...)` بدون انتساب نتیجه به یک متغیر تبدیل کرد. بدنه تابع بعداً از `parent.id`, `parent.project_id` و `parent_ws_ids = ws_repo.get_resource_workspace_ids(db, "task", parent.id)` استفاده میکند، در حالی که `parent` در scopes خود تعریف نشده است.

### ۲. علائم
فراخوانی `POST /api/tasks/{id}/subtasks` (پس از عبور از بررسی مجوز) احتمالاً با `NameError` مواجه میشود و بهصورت `HTTP 500` ظاهر میگردد. متن دقیق پیام خطا در زمان اجرا ثبت نشده است؛ نوع خطا از کد استنباط شده است.

### ۳. ریشه
از دست رفتن مقدار برگشتی `_admin_task` هنگام جایگزینی `_visible_task`. `_visible_task` یک تاپل `(Task, role)` برمیگرداند و کد قدیمی آن را به `parent, role` منتسب میکرد؛ `_admin_task` تنها شیء `Task` را برمیگرداند و انتساب حذف شد، ولی مصرفکنندههای `parent` باقی ماندند.

### ۴. بررسی
خواندن خطوط مربوطه در `service.py`:

```python
_admin_task(db, actor_id, parent_task_id, workspace_id=workspace_id)
...
parent_task_id=parent.id,
project_id=parent.project_id,
...
parent_ws_ids = ws_repo.get_resource_workspace_ids(db, "task", parent.id)
```

هیچ تعریف دیگری برای `parent` در این تابع وجود ندارد. بررسیstatic این شکاف را تأیید میکند.

### ۵. راهحل (پیشنهادی، اعمال نشده)
انتساب نتیجه:_

```python
parent = _admin_task(db, actor_id, parent_task_id, workspace_id=workspace_id)
```

پس از آن تمام ارجاعات `parent.id` / `parent.project_id` معتبر میشوند و مجوز owner-only همانگونه که طراحی شده باقی میماند. **هیچ تغییری در سورس توسط نگارنده اعمال نشد.**

### ۶. فایلها/توابع تغییریافته
هیچ فایلی تغییر نخواست. محل شکاف: `service/task/service.py::create_subtask`. مسیر تحت تأثیر: `POST /api/tasks/{task_id}/subtasks` در `service/task/router.py::create_subtask`.

### ۷. تأیید
- تأییدشده: توسط بررسی کد (کد فعلی فاقد انتساب `parent` است ولی از آن استفاده میکند).
- **NOT TESTED**: رفتار runtime تست نشد؛ `pytest` در دسترس نبود و تماس مستقیم با endpoint هم توسط نگارنده انجام نشد. بنابراین نباید ادعا کرد که پاسخ دقیقاً `500` و با پیام `NameError` است؛ تنها «محتمل» است.

### ۸. آموختهها
تغییر تابع کمکی (`_visible_task` → `_admin_task`) بدون بازبینی تمام مصرفکنندههای مقدار برگشتی، میتواند شکافی ایجاد کند که تنها در زمان اجرا ظاهر شود. تفاوت در شکل خروجی (تاپل در برابر شیء) باید صریحاً در review بررسی شود.

### ۹. پیشگیری
اضافه کردن تست API برای `POST /api/tasks/{id}/subtasks` (موفقیت، مجوز نامعتبر، parent نامعتبر) و اسکنstatic برای متغیرهای مورداستفاده و تعریفنشده (مثلاً flake8/pyflakes F821) در CI.

---

# SECTION د — چالشهای فرانتاند

## د.۱ ReferenceError مربوط به `emptyTitle` در `TaskBoardView` پس از rebase

**وضعیت: تأییدشده در کد فعلی؛ متن دقیق پیام خطا بهصورت شفاهی گزارش شده یا از کد استنباط شده است.**

### ۱. مشکل
پس از rebase، برخی uppercaseها `TaskBoardView` را با propهای ناقص رندر میکردند و کامپوننت هنگام رندر حالت خالی به متغیر `emptyTitle` (و `emptyDescription`) بدون تعریف دسترسی پیدا میکرد.

### ۲. علائم
خطای ReferenceError هنگام نمایش حالت خالی کانبان (متن دقیق خطا بهصورت شفاهی گزارش شده یا از کد استنباط شده است)؛ صفحه Tasks بهجای EmptyState crashes میشد.

### ۳. ریشه
حذف/جابهجایی تعریف prop پیشفرض در طول rebase در حالی که بدنه JSX همچنان از آن استفاده میکرد.

### ۴. بررسی
مقایسه امضای کامپوننت با تمام محلهای فراخوانی (`TasksPage`, سایر uppercaseها) و بررسی مسیر رندر `!items.length`.

### ۵. راهحل
اضافه شدن propهای پیشفرض در امضای کامپوننت:

```jsx
emptyTitle = 'No tasks found',
emptyDescription = 'Try adjusting filters or create a new task.',
```

و ارسال نهایتاً به `<EmptyState title={emptyTitle} description={emptyDescription} />`.

### ۶. فایلها/توابع تغییریافته
`web/app/task/TaskBoardView.jsx` (امضای کامپوننت و بلوک EmptyState)؛ مصرفکننده `web/app/task/TasksPage.jsx`.

### ۷. تأیید
خواندن کد فعلی نشان میدهد پیشفرضها موجوداند؛ تست خودکار اجرا نشد.

### ۸. آموختهها
هر prop که در JSX خوانده میشود باید پیشفرض داشته باشد یا در تمام فراخوانیها تأمین شود؛ rebaseها MVPهایی را ایجاد میکنند که فقط در حالت خالی ظاهر میشوند.

### ۹. پیشگیری
کامپوننتهایی را که در چند view استفاده میشوند با `defaultProps` / پیشفرض در destructuring بنویسید و حالت خالی را در بررسیهای بصری تست کنید.

---

## د.۲ چرخه «maximum update depth» ناشی از `resetPagination` ناپایدار

**وضعیت: تأییدشده (کد و توضیح صریح در هوک).**

### ۱. مشکل
`TasksPage` در یک `useEffect` به `resetPagination` وابسته بود و هوک `useTaskFilters` هر بار یک تابع inlineجدید برمیگرداند؛ هر اجرای effect باعث نوشتن URL و renderجدید میشد و چرخه بیپایان («maximum update depth») شکل میگرفت.

### ۲. علائم
خطای React مربوط به maximum update depth (نوع/پیام خطا بهصورت شفاهی گزارش شده یا از کد استنباط شده است)؛ صفحه Tasks هنگام تغییر workspaceScope یخ میزد.

### ۳. ریشه
عدم پایداری هویت تابع (`reference identity`) در هوک، در حالی که مصرفکننده آن را در آرایه وابستگی effect قرار داده بود.

### ۴. بررسی
خواندن `useTaskFilters` و effect مربوطه در `TasksPage`:

```jsx
useEffect(() => { resetPagination?.() }, [workspaceScope, resetPagination])
```

### ۵. راهحل
تعریف پایدار با `useCallback`:

```js
const resetPagination = useCallback(
  () => updateParams((next) => next.delete('page'), { replace: true }),
  [updateParams],
)
```

همچنین `updateParams` و سایر توابع هوک خودشان `useCallback`اند و `query` با `useMemo` پایدار شده است.

### ۶. فایلها/توابع تغییریافته
`web/app/task/hooks/useTaskFilters.js`: `resetPagination` (همراه توضیح هدف در کد)؛ `web/app/task/TasksPage.jsx` effect وابسته.

### ۷. تأیید
خواندن کد فعلی؛ اجرای مرورگر توسط نگارنده انجام نشد.

### ۸. آموختهها
هر تابعی که بهعنوان dependency به effect میرود باید `useCallback` با طول ثابت باشد؛ inline callback در return هوک یک تله رایج است.

### ۹. پیشگیری
استفاده از `useCallback` در تمام توابع برگرداندهشده توسط هوکها و بررسیEffect dependencyها در code review.

---

## د.۳ کرش submit چکلیست بهعلت فرم تودرتو و TDZ

**وضعیت: احتمالی (نوع/پیام خطا بهصورت شفاهی گزارش شده یا از کد استنباط شده است؛ الگوی رفع در کد قابل مشاهده است).**

### ۱. مشکل
زمانی که `TaskChecklistSection` داخل `<form id="task-dialog-form">` رندر میشد، دکمهها و ورودیهای چکلیست میتوانستند caused submit ناخواسته فرم والد شوند؛ همزمان دسترسی به متغیر قبل از مقداردهی (TDZ) در مسیر submit میتوانست خطا ایجاد کند.

### ۲. علائم
کلیک Add/Enter داخل چکلیستdialog، فرم والد را submit میکرد و منجر به کرش/رفتار غیرمنتظره میشد (متن دقیق خطا بهصورت شفاهی گزارش شده یا از کد استنباط شده است).

### ۳. ریشه
نبود `type="button"` و `preventDefault`/`stopPropagation` در کنترلهای چکلیست و نبود ترتیب امن مقداردهی متغیرها در هندلر.

### ۴. بررسی
بررسی ساختار `TaskDialog.jsx` (فرم والد) و `TaskChecklistSection.jsx` (دکمهها، `onKeyDown` و `handleAdd`).

### ۵. راهحل
- تمام دکمههای چکلیست صریحاً `type="button"`اند.
- `handleAdd(e)` با `e?.preventDefault?.()` شروع میشود.
- `onKeyDown` روی Input و ویرایش عنوان، `preventDefault()` + `stopPropagation()` را قبل از فراخوانی هندلر اعمال میکند.
- هندل drag با `e.preventDefault()` + `e.stopPropagation()` از تداخل با کلیک/فرم جلوگیری میکند.

### ۶. فایلها/توابع تغییریافته
`web/app/task/TaskChecklistSection.jsx`: `handleAdd`, `handleToggle`, `saveEdit`, `onHandlePointerDown`, دکمهها و `onKeyDown`ها؛ `web/app/task/TaskDialog.jsx` (فرم والد).

### ۷. تأیید
خواندن کد فعلی؛ تست مرورگر توسط نگارنده اجرا نشد.

### ۸. آموختهها
کامپوننت قابلاستفاده داخل فرم نباید فقط روی `<form>` تکیه کند؛ کنترلها باید صریحاً غیرsubmit باشند و رویداد keyboard را متوقف کنند.

### ۹. پیشگیری
قاعده کدنویسی: هر `<button>` داخل فرم حتماً `type` مشخص داشته باشد؛ تستypress/cypress سناریو Enter در چکلیستdialog.

---

## د.۴ پیشنویس چکلیست درdialog ایجاد و retry جزئی

**وضعیت: تأییدشده (کد صریح).**

### ۱. مشکل
اگرtask ایجاد شود ولی برخی آیتمهای چکلیست پیشنویس به هردلیلی شکست بخورند، کلیک مجدد دکمه Save نبایدTask دومی ایجاد کند یا آیتمهای موفق را دوباره ارسال نماید.

### ۲. علائم
خطر تکثیرTask/آیتمها هنگام retry؛ از دست رفتن وضعیت پیشنویس بستهشدنdialog.

### ۳. ریشه
نبود نشانگر «کدام آیتم از قبل ذخیره شد» و ذخیره نشدن `createdTaskId` در پیشنویس sessionStorage.

### ۴. بررسی
خواندن `TaskDialog.handleSubmit` و توابع `readDraft` / `writeDraft` / `clearDraft`.

### ۵. راهحل
- `createdTaskId` در پیشنویس ذخیره میشود؛ در retry، `taskIdForChecklist = createdTaskId` است و `createTask` دوباره فراخوانی نمیشود.
- فقط آیتمهایی که `createdId` ندارند (`filter(item => !item.createdId)`) ارسال میشوند.
- پس از موفقیت، `createdId` روی آیتم تنظیم میشود؛ در شکست، `submitError` و پیام «Task was created, but N checklist items could not be saved. You can retry without creating another task.» نمایش داده میشود.
- پیشنویس با `taskUpdatedAt` در حالت edit محافظت میشود؛ در صورت تغییر سرور، هشدار تعارض و گزینه Restore/Discard ارائه میشود.

### ۶. فایلها/توابع تغییریافته
`web/app/task/TaskDialog.jsx`: `readDraft`, `writeDraft`, `clearDraft`, `handleSubmit`, `handleRestoreConflictDraft`, `handleDialogClose`؛ `web/app/task/TaskChecklistSection.jsx` (حالت draft).

### ۷. تأیید
خواندن کد؛ تست مرورگر اجرا نشد.

### ۸. آموختهها
برای عملیات چندمرحلهای «ایجاد والد سپس فرزندان»، شناسه والد و وضعیت تک تک فرزندان باید در پیشنویس ذخیره شود تا retry idempotent باشد.

### ۹. پیشگیری
استفاده از الگوی createdId/submitError در هر جریان multistep آینده و تست شبکه قطعشده در حین ذخیره.

---

## د.۵ پنهان کردن Sort در کانبان با حفظ وضعیت فیلتر

**وضعیت: تأییدشده (کد صریح).**

### ۱. مشکل
مرتبسازی قابلانتخاب توسط کاربر (`sort=updated_at` مثلاً) با مرتبسازندگیاجباری کانبان (`position`) تداخل داشت؛ اگر وضعیت فیلتر پاک میشد، بازگشت به لیست ترتیب کاربر را از دست میداد.

### ۲. علائم
وقتی کاربر Sort را تغییر میداد و به کانبان میرفت، یا کانبان نامرتب میشد یا هنگام بازگشت به لیست، تنظیمات Sort گم میشد.

### ۳. ریشه
استفاده مستقیم از `query` حاصل از URL در `useTasks` بدون جدا کردن «پارامتر مؤثر» از «وضعیت ذخیرهشده».

### ۴. بررسی
خواندن `TasksPage.jsx` و `useTaskFilters.js`.

### ۵. راهحل
```js
const effectiveQuery = useMemo(
  () => (view === 'kanban' ? { ...query, sort: 'position', order: 'asc' } : query),
  [view, query],
)
```
فیلتر `sort` در URL باقی میماند و فقط پارامتر ارسالی override میشود.

### ۶. فایلها/توابع تغییریافته
`web/app/task/TasksPage.jsx`: `effectiveQuery`, `setView`; `web/app/task/hooks/useTaskFilters.js`: `query`.

### ۷. تأیید
خواندن کد؛ تست بصری اجرا نشد.

### ۸. آموختهها
«پنهان کردن control» نباید به معنای «پاک کردن state» باشد؛ جداسازی state ذخیرهشده و پارامتر مؤثر الگوی تمیزی است.

### ۹. پیشگیری
استفاده از `useMemo` م_calibrated براساس view و اضافه کردن تست UID مبنی بر بازگشت Sort پس از تغییر view.

---

## د.۶ هماهنگسازی deep link `?task=` و بستن تنها با حذف همان پارامتر

**وضعیت: تأییدشده (کد صریح).**

### ۱. مشکل
باز کردن جزئیاتtask نباید فیلترها، view یاdialogها را پاک کند؛ بستن پنل هم نباید سایر پارامترها را حذف کند.

### ۲. علائم
در صورت replace کامل searchParams، کاربر با بستن پنل به صفحه بدون فیلتر برمیگشت و لینک قابلاشتراکی باقی نمیماند.

### ۳. ریشه
نبود تابع متمرکز برای setup/cleanup پارامتر `task`.

### ۴. بررسی
خواندن `TasksPage.setSelectedTaskId` و effect مربوط به `selectedTaskId`.

### ۵. راهحل
```js
const setSelectedTaskId = useCallback((id) => {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev)
    if (id) next.set('task', String(id))
    else next.delete('task')
    return next
  }, { replace: !id })
}, [setSearchParams])
```
انتخابtask push میشود (تا Back دکمه carbara)، بستن آن replace میشود. `closeDialog` جداگانه فقط `dialog` و `taskId` را حذف میکند.

### ۶. فایلها/توابع تغییریافته
`web/app/task/TasksPage.jsx`: `setSelectedTaskId`, `closeDialog`, `openEditDialog`, `openCreateDialog`, `setView`.

### ۷. تأیید
خواندن کد؛ تست بصری اجرا نشد.

### ۸. آموختهها
URL بهعنوان منبع حقیقت، نیاز به عملیات « Immutable setName/delete single key» دارد، نه بازسازی کامل query.

### ۹. پیشگیری
استفاده از helper مشترک `updateParams(mutate, options)` (همانطور که در `useTaskFilters` هست) در تمام صفحات دارای پارامتر deep link.

---

## د.۷ حالت forced dark: متن سفیدdialog داخل زمینه کرمی

**وضعیت: تأییدشده (CSS فعلی).**

### ۱. مشکل
در شرایطی که تم بهصورت اجباری dark میشد،_dialogهای رندرشده در portal (DialogShell) با زمینه کرم/روشن Halgheh نمایش داده میشدند ولی رنگ متن سفید باقی میماند.

### ۲. علائم
متن ناخوانا (سفید روی کرم) در dialogهایtask (ایجاد، ویرایش، Share، حذف).

### ۳. ریشه
 وراثت ناسازگار `color-scheme` و توکن رنگ در عناصر.producted به body/page؛ dialog از تم dark رنگ متن را میگرفت ولی زمینهای کهDialogShell اعمال میکرد روشن بود.

### ۴. بررسی
خواندن `web/app/task/tasks.css` و مشاهده تنظیمات:

```css
color-scheme: only light;
...
.tasks-dialog.tasks-dialog,
... { color-scheme: only light; color: hsl(var(--foreground)); }
```

### ۵. راهحل
محدود کردن `color-scheme` به `only light` و تنظیم صریح token رنگ متن (`hsl(var(--foreground))`) منحصراً در scope dialogها، بهجای تلاش برای override سراسری تم. بدین ترتیب controlهای native (date input, select) نیز با زمینه روشن هماهنگ میشوند.

### ۶. فایلها/توابع تغییریافته
`web/app/task/tasks.css`: rules مربوط به `color-scheme: only light` و `.tasks-dialog` color token؛ مصرفکنندگان `DialogShell` در `TaskDialog.jsx`, `TaskShareDialog.jsx`, `TasksPage.jsx` (ConfirmDialogها).

### ۷. تأیید
خواندن CSS؛ بررسی بصری توسط نگارنده انجام نشد.

### ۸. آموختهها
برای portalها، بهجای مبارزه با تم سراسری، بهتر است «Color scheme محلی + token صریح» تعریف شود تا کنترلهای native و متن با زمینهای که واقعاً رندر میشود هماهنگ شوند.

### ۹. پیشگیری
هر.dialog/new portal باید قواعد color-scheme و color خود را بهصورت scoped داشته باشد و در چک بصری تم روشن/تیره بررسی شود.

---

## د.۸ Memoization `effectiveQuery` و wrapperهای پایدار pointer برای توقف فلکر

**وضعیت: تأییدشده (کد صریح).**

### ۱. مشکل
تغییر هویت `query` و توابع هندلر pointer در هر render باعث میشد `useTasks.load` دوباره اجرا شود و لیستtoolbar فلکر کند؛ در کانبان، listenerهای window گاه zombie میشدند.

### ۲. علائم
درخواستهای تکراری `GET /api/tasks`، فلکر کوتاه لیست و گاه Drag نامعتبر بعد از رندر مجدد.

### ۳. ریشه
- `query` بدون `useMemo` و `effectiveQuery` بدون وابستگی پایدار؛
- توابع `handlePointerMove` / `handlePointerUp` مستقیماً به `addEventListener` داده میشدند و هویت آنها در هر render تغییر میکرد.

### ۴. بررسی
خواندن `TasksPage`, `useTasks`, `useTaskFilters` و `TaskBoardView`.

### ۵. راهحل
- `query` در `useTaskFilters` با `useMemo` و `effectiveQuery` در `TasksPage` با `useMemo`.
- `load` و `reload` در `useTasks` با `useCallback`، همراه `requestRef` و `AbortController` برای لغو درخواست قدیمی.
- در `TaskBoardView` از wrapperهای ثابت `stablePointerMove` / `stablePointerUp` استفاده میشود که همیشه به `handlePointerMoveRef.current` / `handlePointerUpRef.current`delegate میکنند؛ بنابراین `addEventListener` و `removeEventListener` همان تابع را استفاده میکنند.

### ۶. فایلها/توابع تغییریافته
`web/app/task/TasksPage.jsx`, `web/app/task/hooks/useTaskFilters.js`, `web/app/task/hooks/useTasks.js`, `web/app/task/TaskBoardView.jsx`.

### ۷. تأیید
خواندن کد؛ profiler مرورگر توسط نگارنده اجرا نشد.

### ۸. آموختهها
پایداریreference در مرز هوکها و event listenerها، شرط لازم برای جلوگیری از چرخهها و فلکر است.

### ۹. پیشگیری
قاعده: هر شیء/تابعی که وارد dependencyها یا	addEventListener میشود حتماً `useMemo`/`useCallback` یا ref wrapper داشته باشد.

---

## د.۹ Drag pointer/touch و Load More بدون تکثیر آیتم

**وضعیت: تأییدشده (کد صریح).**

### ۱. مشکل
پشتیبانی همزمان ماوس و لمس در کانبان و چکلیست، همراه با بارگذاری صفحات بعدی لیست، میتوانست منجر به drag گیرکرده، کلیک ناخواسته بعد از drag و تکثیر آیتمها شود.

### ۲. علائم
کارت پس از drag کلیک هم میشد (باز شدن پنل)، listener باقیمانده بعد از `pointercancel`، و تکرار آیتم هنگام Load more یا change فیلتر.

### ۳. ریشه
استفاده از `mousedown/mousemove` (فاقtd ماوس)، نبود آستانه حرکت و نبود dedup در `setItems` حالت append.

### ۴. بررسی
خواندن `TaskBoardView` (pointer events, `suppressClickRef`, `pendingRef` با آستانه 8px، `setPointerCapture`) و `useTasks.load` (`seen Set`) و `TaskChecklistSection` (pointer capture + cleanup).

### ۵. راهحل
- `pointerdown/pointermove/pointerup/pointercancel` با `pointerId` و آستانه `Math.hypot(dx, dy) < 8`.
- `setPointerCapture` و cleanup کامل listenerها، جلوگیری از zombie؛ `suppressClickRef` بهمدت 250ms کلیک بعد از drag را سرکوب میکند.
- `load(..., {append:true})` با `seen = new Set(prev.map(i => i.id))` آیتمهای تکراری را حذف میکند؛ `requestRef` + abort درخواست قدیمی را لغو میکند.
- `TaskChecklistSection` ALSOpointer capture و `dragCleanupRef` دارد.

### ۶. فایلها/توابع تغییریافته
`web/app/task/TaskBoardView.jsx`, `web/app/task/TaskChecklistSection.jsx`, `web/app/task/hooks/useTasks.js`.

### ۷. تأیید
خواندن کد؛ تست دستگاه لمسی توسط نگارنده اجرا نشد.

### ۸. آموختهها
Pointer Events جایگزین مناسبی برای ترکیب mouse/touchاند، ولی نیازمند آستانه، capture و cleanup دقیقاند؛ pagination همیشه باید dedup براساس id داشته باشد.

### ۹. پیشگیری
استفاده از همان الگوي pointer drag در تمام لیستهای قابلجابجایی و اضافه کردن تست dedup هنگام تغییر سریع فیلترها.

---

# موارد نیازمند بررسی بیشتر

1. **اجرای تستها**: `pytest` در محیط در دسترس نبود؛ تمام تستهای نوشتهشده (`service/tests/test_task_workspace_sharing.py`, `service/tests/test_task_position.py`, `service/tests/test_task_checklist.py`) اجرا نشدند. قبل از ادعا یکپارچگی نهایی، لازم است در محیطی با pytest و دیتابیس disposable مطابق `service/tests/conftest.py` اجرا شوند.
2. **متن دقیق پیامهای خطا**: متن دقیق `TypeError` حادثه Phase 3.1 در شواهد موجود و در بخش الف نقل شده است. برای ReferenceError مربوط به `emptyTitle`، خطای maximum update depth، ResponseValidationError و کرش TDZ، متن دقیق پیام در شواهد موجود نیست؛ در این سند از عبارت «نوع/پیام خطا بهصورت شفاهی گزارش شده یا از کد استنباط شده است» استفاده شد. در صورت دسترسی به لاگها، متن واقعی آنها باید جایگزین شود.
3. **محل دقیق دو head در مهاجرت**: فایل فعلی `033_merge_heads` شاخههای `032` و `020_task_checklist` را ادغام میکند؛ گزارش «دو head» مربوط به مرحله قبلتر است و نقطه انشعاب دقیق (`017`) توسط `alembic history` و فایلهای migration تأیید شده است.
4. **نتیجه بصری رفع CORS در handler 500**: پیشنهاد اضافه کردن هدرهای CORS به handler عمومی 500 مطرح شد، ولی مشخص نیست که آیا در کد فعلی اعمال شده است یا خیر؛ بررسی `service/main.py` / middleware مربوطه توصیه میشود.
5. **رفتار assignment در UI**: frontend عمداً فقط حذف assignee موجود را پشتیبانی میکند (نبود user-directory API). اگر محصول نیاز به اضافهکردن assignee از UI دارد، باید API انتخاب کاربر مجاز طراحی شود؛ فعلاً مسیرها تنها در سطح `api.js` / service موجوداند.
6. **اجرای مهاجرت 034 بر روی کپی واقعی از داده**: منطق توقف در برابر ابهام خوانده شد، ولی رفتار دقیق روی دیتابیسproduction/sample با انجمنهای متعدد بررسی نشد.
7. **عملکرد و=device لمسی**: الگوي pointer drag و Load More dedup از کد تأیید شد، ولی تست real-device و تست بارENCY (تعداد درخواست هنگام فلکر) اجرا نشد.
8. **شکاف `create_subtask` (ج.۴)**: نبود انتساب نتیجه `_admin_task` به `parent` توسط بررسی کد تأیید شده است، ولی رفتار runtime (احتمال `NameError` و `500`) **NOT TESTED** است. لازم است در محیط دارای pytest و با دیتابیس disposable، سناریو `POST /api/tasks/{id}/subtasks` اجرا و سپس (در وظیفهای جداگانه که اجازه تغییر سورس را دارد) اصلاح شود.
