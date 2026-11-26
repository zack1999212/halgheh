# واژهنامهٔ فنی ماژول تسکهای هلقهه

**مخاطب:** کسانی که تازه وارد پروژه شدهاند یا با معماری بکاند/فرانتاند آشنایی مختصری دارند.  
**هدف:** هر اصطلاح با یک تعریف سادهٔ فارسی و یک مثال واقعی از کد هلقهه توضیح داده میشود تا نیازی به حدس زدن معنی آن در اسلایدها یا کد نباشد.

> شیوهٔ خواندن: عنوان فارسی هر مدخل، سپس **English term** و سپس «تعریف ساده» و «مثال در هلقهه». شناسههای انگلیسی (`TaskWorkspace`، `_commit` و ...) عمداً به شکل اصلی نگه داشته شدهاند تا جستجو در کد آسان باشد.

---

## ۱. مبانی وب و لایهٔ HTTP

### ۱.۱ رابط برنامهنویسی کاربردی — **API**
- **تعریف ساده:** قراردادی که به دو نرم افزار اجازه میدهد با هم حرف بزنند. در اینجا یعنی مجموعه قواعدی که مرورگر برای خواندن و تغییر تسکها با سرور استفاده میکند.
- **مثال در هلقهه:** تمام API ماژول تسکها تحت مسیر `/api/tasks` قرار دارد و در `service/task/router.py` تعریف شده است؛ مثلاً `GET /api/tasks` لیست تسکها را میدهد.

### ۱.۲ انتقال حالت بازنمایی — **REST**
- **تعریف ساده:** سبکی طراحی API که در آن هر «چیز» یک آدرس دارد و با متدهای HTTP روی آن کار میکنیم.
- **مثال در هلقهه:** تسک یک منبع است: `POST /api/tasks` آن را میسازد، `GET /api/tasks/{task_id}` آن را میخواند، `PATCH /api/tasks/{task_id}` ویرایش میکند و `DELETE` حذف مینماید (`service/task/router.py`).

### ۱.۳ پروتکل انتقال ابرمتن — **HTTP**
- **تعریف ساده:** زبانی که مرورگر و سرور برای رد و بدل کردن درخواست و پاسخ ازมันفاده میکنند؛ شامل متدهایی مثل GET و POST و کدهایی مثل 200 و 404.
- **مثال در هلقهه:** قرارداد کد وضعیت در ابتدای `service/task/router.py` نوشته شده: 201 برای ایجاد، 204 برای حذف و 200 برای بقیه عملیات.

### ۱.۴ نقطهٔ دسترسی — **Endpoint**
- **تعریف ساده:** یک آدرس مشخص (مسیر + متد) که سرور روی آن گوش میدهد.
- **مثال در هلقهه:** `PATCH /api/tasks/{task_id}/position` یک endpoint است که جابهجایی کارت در Kanban را handle میکند (`router.py:361`، تابع `set_task_position`).

### ۱.۵ درخواست و پاسخ — **Request / Response**
- **تعریف ساده:** درخواست چیزی است که کلاینت میفرستد (مسیر، هدرها، بدنه) و پاسخ چیزی است که سرور برمیگرداند (کد وضعیت + داده).
- **مثال در هلقهه:** در `create_task` (`router.py:124`) بدنهٔ درخواست از نوع `TaskCreate` است و پاسخ با `response_model=TaskResponse` و کد 201 برگردانده میشود.

### ۱.۶ مسیریاب — **Router**
- **تعریف ساده:** بخشی از کد که مشخص میکند هر آدرس با کدام تابع اجرا شود.
- **مثال در هلقهه:** `router = APIRouter(prefix="/api/tasks", tags=["tasks"])` در `service/task/router.py:59`—همهٔ endpointهای تسکها از این prefix استفاده میکنند.

### ۱.۷ لایهٔ سرویس — **Service Layer**
- **تعریف ساده:** لایهای که «قواعد کسبوکار» در آن زندگی میکند: چه کسی مجاز است، چه تغییری مجاز است و چه زمانی ذخیره شود.
- **مثال در هلقهه:** `service/task/service.py`—توابعی مانند `set_task_status` و `attach_task_to_workspace` تصمیمهای مجوز و transaction را میگیرند و Router فقط آنها را صدا میزند.

### ۱.۸ الگوی مخزن — **Repository Pattern**
- **تعریف ساده:** الگویی که تمام دسترسی به دیتابیس را در یک لایهٔ جداگانه جمع میکند تا بقیهٔ کد مستقیم SQL ننویسد.
- **مثال در هلقهه:** `service/task/repository.py` تنها جایی است که queryهای تسک نوشته میشود؛ service با فراخوانی `repository.list_checklist_items(...)` از جزئیات SQL بیخبر میماند.

---

## ۲. داده، ORM و مهاجرت

### ۲.۹ نگاشت شیءگرا به رابطه — **ORM**
- **تعریف ساده:** ابزاری که جدول دیتابیس را به شکل کلاس پایتونی نشان میدهد تا به جای نوشتن SQL با شیء کار کنیم.
- **مثال در هلقهه:** کلاس `Task` در `service/task/models.py` نمایانگر جدول `tasks` است؛ سطرها به شکل شیء `Task` در service ظاهر میشوند.

### ۲.۱۰ SQLAlchemy
- **تعریف ساده:** کتابخانهای در پایتون که هم ORM ارائه میدهد و هم ابزار ساخت SQL ایمن.
- **مثال در هلقهه:** `Mapped` و `mapped_column` در `service/workspace/models.py` و `Session` + `select(...)` در `service/task/service.py` همگی از SQLAlchemyاند.

### ۲.۱۱ Pydantic
- **تعریف ساده:** کتابخانهای برای تعریف شکل data و اعتبارسنجی آن؛ اگر چیزی به شکل مورد انتظار نبود، خطای واضح میدهد.
- **مثال در هلقهه:** `TaskFilter` در `service/task/schemas.py`ورودی `limit` را بین ۱ و ۱۰۰ محدود میکند و `_task_filter` در `router.py:67` خطای ValidationError را به پاسخ 422 تبدیل مینماید.

### ۲.۱۲ مهاجرت — **Migration**
- **تعریف ساده:** فایل تغییراتی که ساختار دیتابیس را به صورت مرحلهای و قابلردیابی عوض میکند، شبیه Git برای schema.
- **مثال در هلقهه:** `alembic/versions/034_task_workspace_sharing.py` ستونهای `is_original` و `permission_level` و `shared_by_user_id` را اضافه میکند وdata قبلی را backfill مینماید.

### ۲.۱۳ Alembic
- **تعریف ساده:** ابزاری که فایلهای migration را اجرا و ردیابی میکند.
- **مثال در هلقهه:** زنجیره `017 → ... → 032` و `020_task_checklist` سپس `033_merge_heads` و `034_task_workspace_sharing`، همگی توسط Alembic مدیریت میشوند.

### ۲.۱۴ کلید خارجی — **Foreign Key**
- **تعریف ساده:** ستونی که به ردیفی در جدول دیگری اشاره میکند و تضمین مینماید آن ردیف وجود دارد.
- **مثال در هلقهه:** `TaskWorkspace.task_id` با `ForeignKey("tasks.id", ondelete="CASCADE")` در `service/workspace/models.py:144`—با حذف تسک، associationهایش هم پاک میشوند.

### ۲.۱۵ کلید اصلی — **Primary Key**
- **تعریف ساده:** شناسهای که هر ردیف را در جدول منحصر به فرد میکند.
- **مثال در هلقهه:** در `TaskWorkspace` کلید اصلی **ترکیبی** از `(task_id, workspace_id)` است (`service/workspace/models.py:144–149`)، پس نمیتوان دو بار همان تسک را به همان Workspace متصل کرد.

### ۲.۱۶ نمایه — **Index**
- **تعریف ساده:** ساختاری کمکی در دیتابیس که جستجو را سریعتر میکند، مثل فهرست کتاب.
- **مثال در هلقهه:** `ix_task_workspaces_workspace_id` جستجوی تسکهای یک Workspace را سریع میکند و `uq_task_workspaces_original_task` یک index جزئی_unique است که تضمین میکند هر تسک فقط یک association اصلی داشته باشد.

### ۲.۱۷ Many-to-Many — **Many-to-Many**
- **تعریف ساده:** رابطهای که در آن هر ردیف از جدول A میتواند به چند ردیف از B وصل شود و بالعکس.
- **مثال در هلقهه:** یک تسک میتواند در چند Workspace دیده شود و هر Workspace چند تسک دارد؛ واسطهٔ این رابطه جدول `task_workspaces` است.

### ۲.۱۸ جدول رابط — **Association Table**
- **تعریف ساده:** جدول کوچکی که فقط وظیفهٔ اتصال دو جدول را دارد و معمولاً metadata اضافی هم نگه میدارد.
- **مثال در هلقهه:** `task_workspaces` علاوه بر دو کلید، `is_original` و `permission_level` و `shared_by_user_id` را هم ذخیره میکند (`service/workspace/models.py:120`).

### ۲.۱۹ تراکنش — **Transaction**
- **تعریف ساده:** بستهای که چند تغییر را یا همه با هم ذخیره میکند یا هیچکدام؛ نیمه تمام شدن مجاز نیست.
- **مثال در هلقهه:** `_commit(db, *, conflict_detail, conflict_status)` در `service/task/service.py:95`—تغییر تسک و رد `TaskActivity` در همان commit انجام میشوند و در صورت `IntegrityError` همه rollback میشوند.

---

## ۳. امنیت

### ۳.۲۰ احراز هویت — **Authentication**
- **تعریف ساده:** مشخص کردن «کی هستی؟»؛ معمولاً با توکنی که همراه درخواست میآید.
- **مثال در هلقهه:** تمام endpointها از `Depends(get_current_user)` از `service/auth/dependencies.py` استفاده میکنند؛ شناسهٔ کاربر به service داده میشود، نه به بدنهٔ درخواست.

### ۳.۲۱ مجوزدهی — **Authorization**
- **تعریف ساده:** مشخص کردن «حق انجام این کار را داری؟» بعد از اینکه مشخص شد کی هستی.
- **مثال در هلقهه:** `permissions.py` با توابعی چون `can_edit()` و `can_share()` تصمیم میگیرد؛ نتیجهٔ منفی یا 404 (نامرئی) است یا 403 (مرئی ولی ممنوع).

### ۳.۲۲ کنترل دسترسی مبتنی بر نقش — **RBAC**
- **تعریف ساده:** مدلی که حقوق را بر اساس «نقش» کاربر تعریف میکند نه تک تک افراد.
- **مثال در هلقهه:** نقشهای تسک `owner` / `editor` / `assignee` / `project_viewer` / `none` در `service/task/permissions.py` و نقشهای Workspace `admin` / `editor` / `viewer` در `service/workspace/models.py`—هر کدامPredicate مخصوص خود را دارند.

---

## ۴. فرانتاند

### ۴.۲۳ کامپوننت ریکت — **React Component**
- **تعریف ساده:** تکهای قابلاستفادهٔ رابط کاربری که ورودی میگیرد و بخشی از صفحه را رسم میکند.
- **مثال در هلقهه:** `TasksPage.jsx` کامپوننت اصلی صفحه است و کامپوننتهای `TaskBoardView` و `TaskListView` و `TaskDetailPanel` را رسم میکند.

### ۴.۲۴ خصوصیات — **Props**
- **تعریف ساده:** ورودیهایی که یک کامپوننت از والد خود میگیرد، شبیه پارامتر تابع.
- **مثال در هلقهه:** در `TasksPage.jsx:433` به `TaskBoardView` propهایی مانند `items`، `onMoveTask`، `onOpen` و `activeWorkspaceId` داده میشود.

### ۴.۲۵ وضعیت — **State**
- **تعریف ساده:** دادهٔ موقتی که کامپوننت نگه میدارد و با تغییر آن دوباره رسم میشود.
- **مثال در هلقهه:** `useState` در `TasksPage.jsx` برای `workspaceScope`، `dialogMode`، `selectedTaskId` و `deleteTarget` (`TasksPage.jsx:37–61`).

### ۴.۲۶ هوک — **Hook**
- **تعریف ساده:** تابع ویژهای ریکت که به کامپوننت قابلیتهایی مثل نگه داشتن state یا اجرای کار در زمان مناسب میدهد.
- **مثال در هلقهه:** `useTasks`، `useTaskFilters` و `useTaskMutations` در پوشهٔ `web/app/task/hooks/`—مثلاً `useTaskFilters` فیلترها و صفحهبندی را از URL میخواند.

### ۴.۲۷ اثر جانبی — **Effect**
- **تعریف ساده:** هوکی که بعد از رسم کامپوننت، کاری خارج از رسم مثل فراخوانی API یا تنظیم رویداد را انجام میدهد.
- **مثال در هلقهه:** `useEffect` در `TasksPage.jsx:125–127` هنگام تغییر `workspaceScope` تابع `resetPagination()` را صدا میزند.

### ۴.۲۸ حافظهگیری — **Memoization**
- **تعریف ساده:** نگه داشتن نتیجهٔ یک محاسبه تا زمانی که ورودیهایش عوض نشدهاند، برای جلوگیری از کار اضافی.
- **مثال در هلقهه:** `effectiveQuery` در `TasksPage.jsx:129` با `useMemo` ساخته شده و تنها وقتی `view` یا `query` تغییر کند دوباره محاسبه میشود.

### ۴.۲۹ مسیریابی — **Routing**
- **تعریف ساده:** تعیین اینکه بر اساس آدرس مرورگر کدام صفحه و کدام حالت نمایش داده شود.
- **مثال در هلقهه:** `useSearchParams` در `TasksPage.jsx` مقادیر `view`، `dialog`، `taskId` و `task` را میخواند؛ مثلاً `view=list` نمای لیست راactive میکند.

### ۴.۳۰ پارامترهای کوئری — **Query Parameters**
- **تعریف ساده:** قسمتی از URL بعد از `?` که اطلاعاتی مثل فیلتر و صفحه را منتقل میکند.
- **مثال در هلقهه:** `_task_filter` در `router.py:67` پارامترهایی چون `status`، `workspace_id`، `limit` و `offset` را از query میخواند و به `TaskFilter` میدهد.

### ۴.۳۱ کشیدن و رها کردن — **Drag and Drop**
- **تعریف ساده:** جابهجایی آیتم با mouse یا انگشت روی صفحه.
- **مثال در هلقهه:** در Kanban (`TaskBoardView.jsx`) و چکلیست (`TaskChecklistSection.jsx`) جابهجایی در نهایت به `PATCH /{task_id}/position` و `PATCH /{task_id}/checklist/reorder` منجر میشود.

### ۴.۳۲ رویدادهای اشارهگر — **Pointer Events**
- **تعریف ساده:** رویدادهایی که حرکت ماوس، انگشت یا قلم را دنبال میکنند و جایگزین drag-and-drop قدیمی HTML شدهاند.
- **مثال در هلقهه:** `TaskBoardView.jsx:142` از `setPointerCapture` و گوش دادن به `pointermove` با `{ passive: false }` استفاده میکند؛ `TaskChecklistSection.jsx:270` الگوی مشابهی دارد.

### ۴.۳۳ تأخیر انداختن — **Debouncing**
- **تعریف ساده:** صبر کردن تا کاربر دست از تایپ بکشد، سپس یک بار درخواست فرستادن—برای جلوگیری از ارسال درخواست به ازای هر حرف.
- **مثال در هلقهه:** `TasksFilters.jsx:39–50` با `setTimeout` و `clearTimeout` ارسال جستجو را تأخیر میاندازد.

### ۴.۳۴ صفحهبندی — **Pagination**
- **تعریف ساده:** تقسیم لیست بلند به صفحههای کوچکتر تا هم بار سرور کم شود هم نمایش سریعتر باشد.
- **مثال در هلقهه:** `limit` و `offset` در `_task_filter` (`router.py:80–81`) و پاسخ `TaskListResponse` با فیلدهای `{items, total, limit, offset}`؛ در فرانتاند `useTasks` متد `loadMore` دارد.

### ۴.۳۵ پیوند عمیق — **Deep Linking**
- **تعریف ساده:** لینکی که مستقیماً به یک قسمت خاص از برنامه میرسد، نه فقط صفحهٔ اصلی.
- **مثال در هلقهه:** با باز کردن `/tasks?task=42` در `TasksPage.jsx:41–42` پانل جزئیات تسک شمارهٔ 42 خودکار باز میشود.

---

## ۵. کیفیت و قابلیت اطمینان

### ۵.۳۶ قابلیت تکرارپذیری — **Idempotency**
- **تعریف ساده:** خاصیتی که تکرار یک عملیات نتیجهای مشابه بار اول بدهد و خرابی ایجاد نکند.
- **مثال در هلقهه:** تکرار `POST /api/tasks/{id}/workspaces/{ws}` یک association دوم ایجاد نمیکند بلکه `attached=false` برمیگرداند (`service.py:1767–1773`)؛ تغییر وضعیت به همان وضعیت فعلی هم no-op است.

### ۵.۳۷ یکپارچگی داده — **Data Integrity**
- **تعریف ساده:** اطمینان از اینکه data همیشه طبق قواعد تعریفشده باقی میماند، حتی وقتی چند نفر همزمان کار میکنند.
- **مثال در هلقهه:** محدودیت `ck_task_workspaces_permission_level` فقط `viewer`/`editor` را میپذیرد و `uq_task_workspaces_original_task` اجازهٔ دو association اصلی را نمیدهد (`service/workspace/models.py:129–141`).

### ۵.۳۸ بازگشت مشکل قدیمی — **Regression**
- **تعریف ساده:** خراب شدن چیزی که قبلاً درست کار میکرد، معمولاً بعد از یک تغییر جدید.
- **مثال در هلقهه:** حذف آرگومان `conflict_status` از سه فراخوانی `_commit` در Phase 3.1 باعث TypeError و 500 شد؛ تست QA همان سناریو را دوباره اجرا کرد تا مطمئن شود برنگشته است.

### ۵.۳۹ تست دودی — **Smoke Test**
- **تعریف ساده:** یک تست سریع و سطحی که فقط چک میکند «سیستم اصلاً کار میکند؟»، نه جزئیات.
- **مثال در هلقهه:** تسک disposable در QA: ساخت → share → تکرار share → تغییر مجوز → تلاش حذف توسط owner → unshare → اطمینان از باقی ماندن تسک کاننیکال → پاکسازی.

---

## ۶. اصطلاحات مخصوص هلقهه Tasks

### ۶.۴۰ association تسک–Workspace — **TaskWorkspace**
- **تعریف ساده:** مدل/SQLAlchemyای که اتصال یک تسک به یک Workspace را ذخیره میکند.
- **مثال در هلقهه:** کلاس `TaskWorkspace` در `service/workspace/models.py:120` با جدول `task_workspaces`؛ همان چیزی که `list_task_workspaces` (`service.py:1714`) آن را لیست میکند.

### ۶.۴۱ اصلی بودن association — **is_original**
- **تعریف ساده:** پرچم بولی که مشخص میکند این ردیف « Workspace زادگاه تسک» است یا یک اشتراک اضافی.
- **مثال در هلقهه:** در `service/workspace/models.py:150` تعریف شده؛ مهاجرت 034 با `_resolve_original_workspace()` آن را backfill میکند و حذف یا تنظیم مجوز روی ردیف اصلی با 400 رد میشود (`service.py:1820`، `:1863`).

### ۶.۴۲ سطح مجوز اشتراک — **permission_level**
- **تعریف ساده:** رشتهای که میگوید Workspace مقصد فقط میبیند (`viewer`) یا میتواند ویرایش هم بکند (`editor`).
- **مثال در هلقهه:** ستون در `TaskWorkspace` (`service/workspace/models.py:153`) با CHECK constraint؛ endpoint `PATCH /{task_id}/workspaces/{workspace_id}` آن را عوض میکند (`router.py:679`).

### ۶.۴۳ وضعیت تضاد — **conflict_status**
- **تعریف ساده:** پارامتر اجباری `_commit` که تعیین میکند در برخورد با خطای دیتابیس چه کد HTTP برگردانده شود.
- **مثال در هلقهه:** `_commit(db, *, conflict_detail, conflict_status)` در `service.py:95`—مقادیر فعلی: attach → 409، detach → 400، update permission → 400. نبود همین پارامتر در سه جا باعث incidents Phase 3.1 شد.

### ۶.۴۴ کوئری مؤثر — **effectiveQuery**
- **تعریف ساده:** کوئریی که واقعاً به بکاند فرستاده میشود، بعد از اینکه نما و فیلترها روی کوئری اصلی اعمال شدند.
- **مثال در هلقهه:** در `TasksPage.jsx:129` وقتی `view === 'kanban'`، همیشه `{ ...query, sort: 'position', order: 'asc' }` ساخته میشود تا ترتیب کارتها پایدار بماند.

### ۶.۴۵ تنظیم مجدد صفحهبندی — **resetPagination**
- **تعریف ساده:** تابعی که offset/صفحهٔ جاری را به ابتدا برمیگرداند تا نتایج قدیمی روی context جدید اعمال نشود.
- **مثال در هلقهه:** `resetPagination` در `web/app/task/hooks/useTaskFilters.js:160` تعریف و در `TasksPage.jsx:125–127` هنگام تغییر `workspaceScope` فراخوانی میشود.

---

## منابع سریع در کد

| نیاز | فایل |
|------|------|
| لیست endpointها و کدهای وضعیت | `service/task/router.py` |
| قواعد کسبوکار و transaction | `service/task/service.py` |
| تصمیمهای مجوز | `service/task/permissions.py` |
| queryها و SQL | `service/task/repository.py` |
| مدلهای درخواست/پاسخ | `service/task/schemas.py` |
| جدولها و constraintها | `service/task/models.py`، `service/workspace/models.py` |
| مهاجرت اشتراکگذاری | `alembic/versions/034_task_workspace_sharing.py` |
| صفحه و هوکها | `web/app/task/TasksPage.jsx`، `web/app/task/hooks/` |
| تست مجوز اشتراک | `service/tests/test_task_workspace_sharing.py` |
