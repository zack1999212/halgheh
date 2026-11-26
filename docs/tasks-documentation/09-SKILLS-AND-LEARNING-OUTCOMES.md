# مهارتها و دستاوردهای یادگیری — ماژول Tasks

## 1. هدف و مقیاس سطحها

این سند مهارتهای بهکارگرفتهشده در پیادهسازی ماژول Tasks را فهرست میکند. سطحها براساس **شواهد موجود** تعیین شدهاند، نه براساس ادعا:

| سطح (انگلیسی) | برچسب فارسی | معنی |
|---|---|---|
| `Introduced to` | آشنایی اولیه | با مفهوم آشنا شده و آنرا مطالعه/مشاهده کرده است؛ اجرای مستقل وجود ندارد. |
| `Practiced` | تمرینشده | در نمونههای محدود و با نظارت/الگو کاربرد داشته است. |
| `Applied independently` | بهکارگرفتهٔ مستقل | بدون نظارت، در کد واقعی پروژه استفاده شده و نتیجه قابل مشاهده است. |
| `Demonstrated in complex implementation` | نشان دادهشده در پیادهسازی پیچیده | در یک سیستم چندلایه با وابستگیها و تصمیمهای متعدد بهکار رفته و اثر آن قابل ردگیری است. |

همچنین هر مهارت با یکی از دو نوع شواهد مشخص میشود:

- **مستقیم نشان دادهشده (Directly demonstrated)** — کد/تصمیم/بررسیای که واقعاً در جلسه انجام یا ایجاد شد.
- **مطالعه/مواجهشده (Encountered/studied)** — تنها از طریق خواندن کد یا مستندات آشنا شده است؛ اجرا نشده است.

> قاعده صداقت: هیچ مهارتی بهعلت «وجود تست» بالاتر ارزیابی نشده است. تستهایی که نوشته شدند ولی بهعلت نبود `pytest` اجرا نشدند، بهعنوان «مطالعه/مواجهشده» یا حداکثر «تمرینشده» ثبت شدهاند.

---

## 2. Backend

### B1 — طراحی و پیادهسازی endpointهای FastAPI
- **معنی ساده:** تعریف مسیرهای HTTP، پارامترها و شکل پاسخ با FastAPI.
- **محل استفاده:** `service/task/router.py` — تمام endpointها تحت prefix `/api/tasks`.
- **فایلها/توابع:** `create_task`، `list_tasks`، `get_task`، `update_task`، `set_task_status`، `set_task_position`، `attach_task_to_workspace`، `detach_task_from_workspace`، `list_checklist_items` و حدود 40 endpoint دیگر؛ `_task_filter` بهعنوان dependency.
- **مهارت عملی نشان دادهشده:** جداسازی لایه HTTP از منطق (router نازک)، تبدیل `ValidationError` به 422، استفاده از `Depends(get_db)` و `get_current_user`، رعایت قرارداد 201/204/200.
- **مثال مصاحبه:** «چرا status را از `PATCH` جدا کردید؟» — پاسخ: چون تغییر وضعیت تنها مسیر معتبر `PUT /{id}/status` است و invariant `completed_at` در یک جا مدیریت میشود.
- **سطح:** `Demonstrated in complex implementation` — **مستقیم نشان دادهشده** (کد نوشته و توسط API smoke / مرورگر بررسی شد).

### B2 — اعتبارسنجی با Pydantic
- **معنی ساده:** تعریف مدلهای ورودی/خروجی و رد داده نامعتبر قبل از رسیدن به منطق.
- **محل استفاده:** `service/task/schemas.py` و `_task_filter` در router.
- **فایلها/توابع:** `TaskCreate`، `TaskUpdate`، `TaskFilter`، `TaskStatusUpdate`، `TaskPositionUpdate`، `TaskWorkspaceOut`؛ whitelistهای معتبر در `normalizeFilters` (طرف frontend).
- **مهارت عملی نشان دادهشده:** اعتبارسنجی فیلترها و تبدیل خطا به پیام خوانا؛ جلوگیری از ورود فیلد `status` از طریق PATCH عمومی.
- **مثال مصاحبه:** «اگر کاربر `sort=foo` بفرستد چه میشود؟» — پاسخ: مقدار پیشفرض اعمال میشود؛ در backend توسط Schema و در UI توسط `VALID_SORT`.
- **سطح:** `Applied independently` — **مستقیم نشان دادهشده** (کد)، تستهای مربوطه `test_invalid_filter_values` و `test_filter_validation_rejects_unknown_values` وجود دارند ولی اجرا نشدند.

### B3 — لایه service و مرز تراکنش
- **معنی ساده:** محل قرارگیری قواعد کسبوکار و تعیین اینکه کجا `commit` صورت گیرد.
- **محل استفاده:** `service/task/service.py`.
- **فایلها/توابع:** `_commit(db, *, conflict_detail, conflict_status)`، `_admin_task`، `_access_role`، `_resolve_task_workspace_id`، تمام توابع CRUD.
- **مهارت عملی نشان دادهشده:** متمرکز کردن تبدیل `IntegrityError` به `HTTPException` با کد/status قابل تنظیم — دقیقاً همان نقطهای که Phase 3.1 اصلاح شد (attach → 409، detach → 400، permission update → 400).
- **مثال مصاحبه:** «چرا repository نباید commit کند؟» — پاسخ: مرز تراکنش در service است تا بتوان خطای دیتابیس را به کد HTTP معنادار تبدیل کرد.
- **سطح:** `Demonstrated in complex implementation` — **مستقیم نشان دادهشده** ( AST scan صفر فراخوانی ناقص `conflict_status`).

### B4 — مجوزدهی شیءگرا و جلوگیری IDOR
- **معنی ساده:** تصمیمگیری درباره اینکه «چه کسی چه تسکی را میبیند/تغییر میدهد».
- **محل استفاده:** `service/task/permissions.py` و `_access_role` در service.
- **فایلها/توابع:** `task_role`، `can_view`، `can_edit`، `can_change_status`، `can_assign`، `can_manage_structure`، `can_manage_labels`، `can_share`، `can_delete_task`، `_role_rank`.
- **مهارت عملی نشان دادهشده:** فلسفه خطای 404 برای منبع نامرئی و 403 برای مجوز ناکافی؛ دو دروازه (نقش Workspace بیرونی + `permission_level` داخلی).
- **مثال مصاحبه:** «چرا غریبه 404 میگیرد نه 403؟» — پاسخ: تا وجود منبع از طریق حدس ID لو نرود.
- **سطح:** `Demonstrated in complex implementation` — **مستقیم نشان دادهشده** (کد + تست امنیتی نوشتهشده ولی اجرا نشده؛ بنابراین رفتار فقط از کد استنتاج شده، نه از اجرا).

### B5 — کوئری SQLAlchemy و طراحی repository
- **معنی ساده:** ساخت کوئریهای ORM بدون committing و بدون بارگذاریهای تکراری (N+1).
- **محل استفاده:** `service/task/repository.py`.
- **فایلها/توابع:** `_visible_clause`، `_accessible_workspace_subquery`، `_order_clause`، `_apply_filters`، `populate_checklist_counts`، `get_status_position_neighbors`، `get_priority_position_neighbors`.
- **مهارت عملی نشان دادهشده:** لیستها scalar-only و شمارش دقیق قبل از limit/offset؛ تک تسک با `selectinload`؛ ترتیب براساس وزن priority.
- **مثال مصاحبه:** «چگونه total دقیق صفحهبندی را با یک کوئری اضافه بدست میآورید؟» — پاسخ: subquery از همان statement فیلترشده قبل از اعمال limit/offset.
- **سطح:** `Applied independently` — **مستقیم نشان دادهشده** (کد).

### B6 — نگاشت خطا به کد وضعیت HTTP
- **معنی ساده:** انتخاب 400/403/404/409 مطابق معنای خطا.
- **محل استفاده:** `_commit`، `_bad_request`، `_forbidden`، `_not_found` در service.
- **فایلها/توابع:** attach → 409، detach → 400، permission update → 400، محافظت ردیف اصلی → 400، حذف share وجودنداشته → 404.
- **مهارت عملی نشان دادهشده:** اصلاح سه فراخوانی `_commit` در Phase 3.1 که `conflict_status` نداشتند (علت خطای 500 و تشخیص اشتباه CORS).
- **مثال مصاحبه:** «چه زمانی 409 مناسبتر از 400 است؟» — پاسخ: هنگام conflict ناشی از وضعیت همزمان/دیتابیس (مثل share تکراری) نه صرفاً ورودی نامعتبر.
- **سطح:** `Applied independently` — **مستقیم نشان دادهشده** (Phase 3.1 AST scan).

---

## 3. Frontend

### F1 — هوکهای React (`useMemo` / `useCallback` / `useEffect`)
- **معنی ساده:** بهینهسازی محاسبات و جلوگیری از اجرای مجدد غیرضروری.
- **محل استفاده:** `web/app/task/TasksPage.jsx`، `hooks/useTaskFilters.js`، `TaskShareDialog.jsx`.
- **فایلها/توابع:** `effectiveQuery = useMemo(..., [view, query])`، `setView`، `setSelectedTaskId`، `contextParams` و `availableWorkspaces` در share dialog.
- **مهارت عملی نشان دادهشده:** مرجع پایدار کوئری برای جلوگیری از چرخه refetch در `useTasks`؛ override صریح `sort=position` برای kanban.
- **مثال مصاحبه:** «چرا `effectiveQuery` را memoize کردید؟» — پاسخ: چون viewerubah طولانی وابستگی `useTasks` است و مرجع جدید هر رندر باعث درخواست مجدد میشود.
- **سطح:** `Demonstrated in complex implementation` — **مستقیم نشان دادهشده**.

### F2 — پایداری وضعیت در URL با react-router
- **معنی ساده:** ذخیره فیلتر/نما/dialog در نشانی صفحه.
- **محل استفاده:** `useSearchParams` در `TasksPage.jsx` و `useTaskFilters.js`.
- **فایلها/توابع:** `normalizeFilters`، `setFilters`، `setView`، `openCreateDialog`، `openEditDialog`، `setSelectedTaskId`، `updateParams`.
- **مهارت عملی نشان دادهشده:** deep link، حفظ وضعیت بعد از refresh، back/forward مرورگر، پالایش پارامترها با whitelist.
- **مثال مصاحبه:** «چگونه لینک قابل اشتراکی برای یک تسک باز میکنید؟» — پاسخ: `?task=12&dialog=edit&taskId=12` در URL.
- **سطح:** `Demonstrated in complex implementation` — **مستقیم نشان دادهشده** (بررسی CDP: deep link، view switch، search).

### F3 — استفاده از shadcn/ui و کامپوننتهای shared
- **معنی ساده:** استفاده مجدد ازprimitiveهای موجود بهجای ساخت دوباره کنترلها.
- **محل استفاده:** `web/app/task/TaskShareDialog.jsx`، `TasksPage.jsx`، سایر کامپوننتها.
- **فایلها/توابع:** `DialogShell`، `ConfirmDialog`، `FormError`، `LoadingState`، `ui/button`، `ui/select`، `ui/label`، `useToast`.
- **مهارت عملی نشان دادهشده:** رعایت قواعد AGENTS.md، ثبات طراحی و دسترسپذیری.
- **مثال مصاحبه:** «چرا dialog سفارشی نساختید؟» — پاسخ: `DialogShell` موجود است و رفتار keyboard/focus را فراهم میکند.
- **سطح:** `Applied independently` — **مستقیم نشان دادهشده** (ایمپورتها در کد).

### F4 — استایلدهی Tailwind و توکنهای تم
- **معنی ساده:** استفاده از کلاسهای utility و متغیرهای CSS موجود.
- **محل استفاده:** `web/app/task/tasks.css` و classNameها در کامپوننتها.
- **فایلها/توابع:** `color-scheme: only light` (خطوط 57 و 364)، متغیرهای `--muted-foreground`، `--border`، `--ring`.
- **مهارت عملی نشان دادهشده:** رفع forced-dark بدون معکوس شدن متن، حفظ پالت مونوکروم گرم.
- **مثال مصاحبه:** «وقتی سیستم dark force میکند متن ناپدید میشود، چه میکنید؟» — پاسخ: `color-scheme: only light` بر سطح مربوطه.
- **سطح:** `Applied independently` — **مستقیم نشان دادهشده** (اسکرینشات CDP).

### F5 — دسترسپذیری و جزئیات تعامل
- **معنی ساده:** label، accessible name و رفتار keyboard مناسب.
- **محل استفاده:** `TaskShareDialog.jsx`، `TasksPage.jsx`.
- **فایلها/توابع:** `Label htmlFor`، `aria-label={`Unshare from ...`}`، `SelectTrigger`، دکمههایdialog.
- **مهارت عملی نشان دادهشده:** رعایت الگوی shared components؛ ولی ماتریس کامل keyboard/responsive اجرا نشد.
- **مثال مصاحبه:** «چگونه مطمئن میشوید دکمه Unshare برای screen reader قابل تشخیص است؟» — پاسخ: `aria-label` صریح.
- **سطح:** `Practiced` — **مستقیم نشان دادهشده** در کد، ولی **مطالعه/مواجهشده** از نظر تست دستی کامل.

---

## 4. Full-stack

### FS1 — یکپارچزی API client و احراز هویت
- **معنی ساده:** ارتباطfrontend با backend همراه token و مدیریت 401.
- **محل استفاده:** `web/app/task/api.js`، `web/app/src/api.js`، `TasksPage.jsx`.
- **فایلها/توابع:** `getToken/setToken/clearToken` (localStorage.token)، `getTask`، `listTasks`، `shareTaskWithWorkspace`، `handleUnauthorized` → `/login`.
- **مهارت عملی نشان دادهشده:** بستن کامل چرخه درخواست→پاسخ→خطا→redirect.
- **مثال مصاحبه:** «اگر token منقضی شود چه اتفاقی میافتد؟» — پاسخ: `clearToken()` و هدایت به `/login`.
- **سطح:** `Applied independently` — **مستقیم نشان دادهشده** (API smoke 200 + کد).

### FS2 — تحویل قابلیت end-to-end (مورد اشتراکگذاری Workspace)
- **معنی ساده:** پیادهسازی یک ویژگی از migration دیتابیس تا رابط کاربری.
- **محل استفاده:** migration `034` → model `TaskWorkspace` → service `_access_role`/attach/detach → router → `TaskShareDialog.jsx`.
- **فایلها/توابع:** تمام لایهها بهصورت هماهنگ؛ activityهای `TASK_ATTACHED` / `TASK_DETACHED` / `TASK_UPDATED`.
- **مهارت عملی نشان دادهشده:** حفظ سازگاری API، حفاظت ردیف اصلی، و جلوگیری از ارتقای مجوز.
- **مثال مصاحبه:** «یک تسک را چگونه بدون کپی کردن با Workspace دوم به اشتراک میگذارید؟» — پاسخ: یک ردیف association جدید با `permission_level` و `shared_by_user_id`.
- **سطح:** `Demonstrated in complex implementation` — **مستقیم نشان دادهشده** (QA task موقت share/duplicate/patch/unshare Passed).

---

## 5. Database / Architecture

### D1 — طراحی migration با نگهبانهای idempotent
- **معنی ساده:** نوشتن مهاجرتی که بتواند بدون شکستن روی محیطهای مختلف اجرا شود.
- **محل استفاده:** `alembic/versions/034_task_workspace_sharing.py`.
- **فایلها/توابع:** `_has_table`، `_has_column`، `_has_index`، `_has_check_constraint`، `upgrade`، `downgrade` (forward-only).
- **مهارت عملی نشان دادهشده:** بررسی وجود قبل از `add_column` / `create_index` / `create_check_constraint` و جلوگیری از اجرای مجدد مخرب.
- **مثال مصاحبه:** «چرا migration را idempotent میکنید؟» — پاسخ: چون محیطها ممکن است در revisions متفاوتی باشند.
- **سطح:** `Applied independently` — **مستقیم نشاندهشده**، ولی اجرا روی دیتابیس واقعی **NOT TESTED** (فقط کد خوانده شد).

### D2 — backfill امن و توقف در ابهام
- **معنی ساده:** پر کردن داده قدیمی بدون حدس زدن اشتباه.
- **محل استفاده:** `_resolve_original_workspace` در `034`.
- **فایلها/توابع:** الویت شواهد: `project.workspace_id` → `task.created` activity → تنها association؛ `RuntimeError` با لیست task IDها؛ بررسی نهایی «دقیقاً یک original».
- **مهارت عملی نشان دادهشده:** ترجیح ایمنی به convenience؛ پیام خطا دقیق.
- **مثال مصاحبه:** «اگر شواهد با هم تناقض داشتند چیکار میکنید؟» — پاسخ: مهاجرت را متوقف کرده و IDها را گزارش میدهیم.
- **سطح:** `Demonstrated in complex implementation` — **مستقیم نشان دادهشده** (تحلیل کد).

### D3 — طراحی association با محدودیتهای دیتابیس
- **معنی ساده:** استفاده از PK مرکب، CHECK و partial unique index برای تضمین درستیdata.
- **محل استفاده:** `service/workspace/models.py::TaskWorkspace`.
- **فایلها/توابع:** `(task_id, workspace_id)` PK، `ck_task_workspaces_permission_level`، `uq_task_workspaces_original_task` (`postgresql_where=is_original`)، FK `shared_by_user_id` با `SET NULL`.
- **مهارت عملی نشان دادهشده:** تضمین «حداکثر یک ردیف اصلی» در سطح دیتابیس، نه فقط service.
- **مثال مصاحبه:** «چگونه تضمین میکنید یک تسک دو workspace اصلی نداشته باشد؟» — پاسخ: partial unique index روی `task_id` جایی که `is_original` true است.
- **سطح:** `Demonstrated in complex implementation` — **مستقیم نشاندهشده**.

### D4 — معماری لایهای و جلوگیری N+1
- **معنی ساده:** جدا کردن HTTP/دامنه/دسترسی دیتابیس و کاهش کوئریهای تکراری.
- **محل استفاده:** `router.py` / `service.py` / `repository.py` / `models` / `schemas`.
- **فایلها/توابع:** docstring صریح repository مبنی بر «no commits, no HTTP errors»، لیستهای scalar-only، `selectinload` برای تک تسک.
- **مهارت عملی نشان daf:** ایجاد نقطه واحد تغییر مجوزها (`permissions.py`).
- **مثال مصاحبه:** «چرا لیست تسکها relationshipها را لمس نمیکند؟» — پاسخ: جلوگیری از N+1 و ساده نگه داشتن شمارش.
- **سطح:** `Applied independently` — **مستقیم نشاندهشده**.

### D5 — ادغام شاخههای migration
- **معنی ساده:** یکپارچه کردن دو head مستقل Alembic.
- **محل استفاده:** `alembic/versions/033_merge_heads.py`.
- **فایلها/توابع:** `down_revision = ("032", "020_task_checklist")`, `upgrade` خالی.
- **مهارت عملی نشان دادهشده:** تشخیص نیاز به merge-only revision بهجای rebase مخرب.
- **مثال مصاحبه:** «دو head دارید، چیکار میکنید؟» — پاسخ: revision ادغام بدون تغییر schema.
- **سطح:** `Practiced` — **مطالعه/مواجهشده** نسبت به طراحی (کد خوانده و بررسی شد، ولی اجرا نشد).

---

## 6. Debugging

### DB1 — بررسی ایستا با Python AST
- **معنی ساده:** تجزیه کد بدون اجرا برای یافتن الگوها/نقصها.
- **محل استفاده:** Phase 3.1 — تأیید سلامت تمام فراخوانیهای `_commit`.
- **فایلها/توابع:** parse تمام فایلها؛ اسکن تمام فراخوانیهای `_commit` و یافتن **صفر** مورد فاقد `conflict_status`.
- **مهارت عملی نشان دادهشده:** یافتن سه مورد نقص و سپس تأیید رفع آنهاستاتیکاً.
- **مثال مصاحبه:** «چگونه مطمئن میشوید هیچ فراخوانی ناقصی باقی نمانده؟» — پاسخ: AST scan با شمارش آرگومان کلیدی اجباری.
- **سطح:** `Demonstrated in complex implementation` — **مستقیم نشاندهشده** (اجرا شد).

### DB2 — عیبیابی خطای 500 به اشتباه CORS
- **معنی ساده:** ردگیری علت واقعی خطا بهجای پذیرش اولین فرضیه.
- **محل استفاده:** Phase 3.1 — علت خطا، `_commit` فاقد `conflict_status` بود (TypeError)، نه تنظیمات CORS.
- **فایلها/توابع:** `_commit` در `service/task/service.py`، لاگ سرور در برابر ظاهر مرورگر.
- **مهارت عملی نشاندهشده:** جداسازی «علامت در مرورگر» از «ریشه در service».
- **مثال مصاحبه:** «مرورگر CORS error نشان میدهد، از کجا شروع میکنید؟» — پاسخ: لاگ سرور را چک میکنم تا ببینم 500 واقعی چیست.
- **سطح:** `Applied independently` — **مستقیم نشاندهشده** (Phase 3.1).

### DB3 — بررسی API در زمان اجرا (smoke)
- **معنی ساده:** فراخوانی endpointها و بررسی کد 200.
- **محل استفاده:** `GET /api/tasks`، `/detail`، `/checklist`، `/workspaces`.
- **فایلها/توابع:** نتایج 200 ثبتشده.
- **مهارت عملی نشاندهشده:** تأیید سریع سلامت مسیرها بعد از تغییرات.
- **مثال مصاحبه:** «بعد از deploy چه چک سریعی میکنید؟» — پاسخ: چهار GET ساده با کد 200.
- **سطح:** `Applied independently` — **مستقیم نشاندهشده**.

### DB4 — بررسی مرورگر/CDP
- **معنی ساده:** مشاهده رفتار واقعی UI و اسکرینشات.
- **محل استفاده:** deep link، تعویض نما، جستجو، جزئیات، dialog ایجاد، افزودن checklist، عدم سرریز افقی، forced-dark.
- **فایلها/توابع:** `TasksPage.jsx`، `tasks.css`، `TaskShareDialog.jsx`.
- **مهارت عملی نشاندهشده:** تشخیص مشکلی که تست jednostکایی آنرا نمیبیند (مانند معکوس شدن رنگ متن).
- **مثال مصاحبه:** «چگونه متوجه میشوید text در حالت forced-dark نامرئی است؟» — پاسخ: اسکرینشات مقایسهای.
- **سطح:** `Applied independently` — **مستقیم نشاندهشده**.

### DB5 — تسک QA موقت (Disposable runtime scenario)
- **معنی ساده:** ساختن یک تسک آزمایشی و اجرای سناریوی کامل share/duplicate/patch/unshare.
- **محل استفاده:** تسک موقت در دیتابیس قابل دورریز، جدا از تستهای pytest.
- **فایلها/توابع:** تمام مراحل: share → duplicate (`attached: false`) → patch permission → unshare → محافظت ردیف اصلی → پاکسازی تسک کانیکال.
- **مهارت عملی نشاندهشده:** طراحی سناریو با پاکسازی و بدون آسیب به داده توسعه.
- **مثال مصاحبه:** «چگونه بدون تست مستقل share را امتحان میکنید؟» — پاسخ: تسک موقت میسازم، سناریو را اجرا و سپس پاک میکنم.
- **سطح:** `Demonstrated in complex implementation` — **مستقیم نشاندهشده**.

### DB6 — یافتن regression بالقوه با بازرسی کد
- **معنی ساده:** دیدن نقصی که هنوز اجرا نشده ولی از کد مشخص است.
- **محل استفاده:** `service/task/service.py::create_subtask` خط 479: نتیجه `_admin_task(...)` به `parent` اختصاص نیافته، ولی خطوط 494/495/503/505/508 از `parent` استفاده میکنند → احتمال `NameError`.
- **فایلها/توابع:** همان تابع؛ مستندشده در `08-TESTING-AND-QUALITY-ASSURANCE.md` بخش 10 و `12-FUTURE-IMPROVEMENTS.md`.
- **مهارت عملی نشاندهشده:** تشخیص الگوی شکسته «بارگذاری + مجوز» با مقایسه سایر توابع service.
- **مثال مصاحبه:** «چرا مقدار `_admin_task` را ذخیره میکنید؟» — پاسخ: چون خودش موجودیت بارگذاریشده را برمیگرداند و بقیه تابع به آن نیاز دارد.
- **سطح:** `Applied independently` — **مستقیم نشاندهشده** (بازرسی) ولی **runtime NOT TESTED** و اصلاح نشد (source تغییر نکرد).

### DB7 — بررسیdiff و نظم تغییرات
- **معنی ساده:** اطمینان از اینکه تغییرات فقط در محدوده مجازاند.
- **محل استفاده:** `git diff --check` و مرور `git status` قبل/بعد از ویرایش.
- **فایلها/توابع:** تست Phase 3.1 Passed؛ در مأموریت اسناد تنها سه فایل مجاز ایجاد شد.
- **مهارت عملی نشاندهشده:** جلوگیری از تغییر ناخواسته source/config/git state.
- **مثال مصاحبه:** «چگونه مطمئن میشوید فقط فایلهای مجاز را تغییر دادهاید؟» — پاسخ: `git status --short` و diff محدود.
- **سطح:** `Practiced` — **مستقیم نشاندهشده**.

---

## 7. Software Engineering

### SE1 — مستندسازی مبتنی بر شواهد
- **معنی ساده:** نوشتن مستنداتی که هر ادعای آن قابل ردگیری به کد/اجرا باشد.
- **محل استفاده:** همین سند و دو سند همراه `07` و `08`.
- **فایلها/توابع:** جدولهای تصمیم (زمینه/گزینه/انتخاب/دلیل/مزایا/معایب/خطر/جایگزین)، طبقهبندی «Test exists / executed / passed / ...»، جدول Phase 3.1.
- **مهارت عملی نشاندهشده:** تمایز «مستند به کد» از «بازنگری» و تمایز «انجامشده» از «NOT TESTED».
- **مثال مصاحبه:** «چگونه مستندات را از حدس زدن محافظت میکنید؟» — پاسخ: هر ردیف را به فایل/خط یا نتیجه اجرا پیوند میدهم.
- **سطح:** `Demonstrated in complex implementation` — **مستقیم نشاندهشده**.

### SE2 — نظم نگارش کد و انضباط محدوده تغییر
- **معنی ساده:** احترام به قراردادهای پروژه و محدودیتهای مأموریت.
- **محل استفاده:** رعایت AGENTS.md (shadcn/shared، Tailwind، عدم نصب وابستگی) و ممنوعیت ویرایش source در این مأموریت.
- **فایلها/توابع:** تنها سه فایل `docs/tasks-documentation/{07,08,09}-*.md` ایجاد شد.
- **مهارت عملی نشاندهشده:** عدم لمس migration، DB، git state، config و فایلهای اسناد دیگر.
- **مثال مصاحبه:** «اگر فقط اجازه تغییر اسناد داشته باشید ولی باگ ببینید چیکار میکنید؟» — پاسخ: آنرا مستند میکنم بدون اینکه source را عوض کنم.
- **سطح:** `Applied independently` — **مستقیم نشاندهشده**.

### SE3 — آگاهی از کیفیت تست و صداقت در reporting
- **معنی ساده:** دانستن اینکه «تست وجود دارد» با «تست اجرا شد» یکی نیست.
- **محل استفاده:** جدول طبقهبندی در سند 08.
- **فایلها/توابع:** تمام تستها بهعنوان `exists / not executed / not possible` ثبت شدند؛ `pytest` موجود نبود و نصب نشد.
- **مهارت عملی نشاندهشده:** جلوگیری از ادعای passed بدون اجرا.
- **مثال مصاحبه:** «تست نوشتهاید ولی اجرا نکردهاید، چگونه reporting میکنید؟» — پاسخ: صراحتاً مینویسم اجرا نشد و دلیل آنرا ذکر میکنم.
- **سطح:** `Practiced` — **مستقیم نشاندهشده**.

### SE4 — تفکیک تصمیم معماری از پیادهسازی
- **معنی ساده:** توضیح «چرا» در کنار «چه» و ثبت گزینههای ردشده.
- **محل استفاده:** سند 07 — 19 تصمیم با گزینههای جایگزین که یا مستند به کداند یا با برچسب «بازنگری» مشخص شدهاند.
- **فایلها/توابع:** D1–D19 بهعلاوه یادداشت خطر بازگشتی `create_subtask`.
- **مهارت عملی نشاندهشده:** جلوگیری از بازنویسی تاریخ تصمیم بهصورت «همیشه همینطور بود».
- **مثال مصاحبه:** «چرا گزینههای ردشده را هم مینویسید؟» — پاسخ: تا تصمیم آینده براساس زمینه درست اتخاذ شود.
- **سطح:** `Applied independently` — **مستقیم نشاندهشده**.

---

## 8. خلاصه سطوح

| مهارت | سطح | نوع شواهد |
|---|---|---|
| B1 FastAPI endpoints | Demonstrated in complex implementation | مستقیم |
| B2 Pydantic validation | Applied independently | مستقیم (اجرای تست: خیر) |
| B3 Service/transaction | Demonstrated in complex implementation | مستقیم |
| B4 Object-level authorization | Demonstrated in complex implementation | مستقیم (اجرای تست: خیر) |
| B5 SQLAlchemy repository | Applied independently | مستقیم |
| B6 HTTP error mapping | Applied independently | مستقیم (Phase 3.1) |
| F1 React hooks | Demonstrated in complex implementation | مستقیم |
| F2 URL state | Demonstrated in complex implementation | مستقیم (CDP) |
| F3 shadcn/shared | Applied independently | مستقیم |
| F4 Tailwind/theme | Applied independently | مستقیم (اسکرینشات) |
| F5 Accessibility | Practiced | مستقیم در کد / مطالعه در تست |
| FS1 API client/auth | Applied independently | مستقیم |
| FS2 End-to-end feature | Demonstrated in complex implementation | مستقیم (QA runtime) |
| D1 Alembic idempotent | Applied independently | مستقیم (اجرا: NOT TESTED) |
| D2 Safe backfill | Demonstrated in complex implementation | مستقیم (تحلیل کد) |
| D3 Association constraints | Demonstrated in complex implementation | مستقیم |
| D4 Layering/N+1 | Applied independently | مستقیم |
| D5 Migration merge | Practiced | مطالعه/مواجهشده |
| DB1 AST static check | Demonstrated in complex implementation | مستقیم (اجرا شد) |
| DB2 500→CORS triage | Applied independently | مستقیم |
| DB3 API smoke | Applied independently | مستقیم |
| DB4 Browser/CDP | Applied independently | مستقیم |
| DB5 Disposable QA scenario | Demonstrated in complex implementation | مستقیم |
| DB6 Regression code-inspection | Applied independently | مستقیم (runtime NOT TESTED) |
| DB7 git diff discipline | Practiced | مستقیم |
| SE1 Evidence-based docs | Demonstrated in complex implementation | مستقیم |
| SE2 Scope discipline | Applied independently | مستقیم |
| SE3 Testing honesty | Practiced | مستقیم |
| SE4 Decision vs implementation | Applied independently | مستقیم |

---

## 9. شواهد Phase 3.1 (خلاصه مربوط به مهارتها)

| مورد | مهارت مرتبط | نتیجه |
|---|---|---|
| اصلاح `_commit` — attach 409 / detach 400 / permission 400 | B3، B6، DB2 | Passed |
| AST parse تمام فایلها | DB1 | Passed |
| AST scan — صفر `_commit` ناقص | DB1 | Passed |
| `git diff --check` | DB7 | Passed |
| `npm run build` (چند فاز) | F1–F4 | Passed |
| Deep link / view switch / search / detail / create dialog / checklist | F2، DB4 | Passed |
| عدم سرریز افقی و اسکرینشات forced-dark | F4، DB4 | Passed |
| API smoke چهار GET | DB3 | Passed (200) |
| QA task: share / duplicate / patch / unshare / original protection / cleanup | DB5، FS2 | Passed |
| `pytest` | SE3 | اجرا نشد (`No module named pytest`) |
| نصب وابستگی | SE2 | انجام نشد |
| یافته `create_subtask` (`NameError` بالقوه) | DB6، SE1 | بازرسی شد، **runtime NOT TESTED**، اصلاح نشد |

---

*منبع شواهد: خواندن مستقیم `service/task/{router,service,repository,permissions,schemas}.py`، `service/workspace/models.py`، `alembic/versions/{020,033,034}*.py`، `service/tests/*`، `web/app/task/*` و نتایج بررسیهای اجرا شده توسط جلسه اصلی. هیچ مهارتیفراتر از شواهد فوق ارزیابی نشده است.*
