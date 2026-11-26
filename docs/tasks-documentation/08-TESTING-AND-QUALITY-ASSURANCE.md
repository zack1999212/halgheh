# تست و تضمین کیفیت — ماژول Tasks

## 1. هدف و دامنه

این سند وضعیت واقعی تستها و بررسیهای کیفیت ماژول Tasks را ثبت میکند. تمایز اصلی متن زیر بین چهار دسته است:

| دسته | تعریف |
|---|---|
| **بررسی ایستا (Static checks)** | بررسی کد بدون اجرا: parse با AST، اسکن الگوها، `git diff --check`. |
| **بررسی API در زمان اجرا (Runtime API checks)** | فراخوانی endpointها روی دیتابیس موقت و بررسی کد وضعیت/پاسخ. |
| **بررسی مرورگر (Browser/CDP checks)** | تعامل با UI و مشاهده نتیجه (deep link، نماها،dialogها، اسکرینشات). |
| **تست خودکار (Automated tests)** | تستهای pytest موجود در مخزن — نوشتهشده ولی **در این محیط اجرا نشدهاند**. |

> **نکته کلیدی:** در محیط حاضر `pytest` موجود نیست (`No module named pytest`) و هیچ نصب وابستگیای انجام نشد. بنابراین تمام تستهای خودکار صرفاً «موجود»اند و نه اجرا شدند و نه نتیجة passed/failed برایشان ثبت شد.

---

## 2. وضعیت کلی (خلاصه)

| دسته | وجود دارد | اجرا شد | نتیجه |
|---|---|---|---|
| تستهای واحد backend (`service/task/tests`) | بله | خیر | اجرا نشد — `pytest` موجود نیست |
| تستهای یکپارچگی backend (`service/tests`) | بله | خیر | اجرا نشد — `pytest` موجود نیست |
| تستهای خودکار frontend | **خیر** | — | پروژه فاقد تست frontend است |
| بررسیهای ایستا (AST parse، AST scan، `git diff --check`) | بله | **بله** | **passed** |
| `npm run build` | بله | **بله (چند فاز)** | **passed** |
| بررسیهای مرورگر/CDP | بله | **بله** | **passed** (موارد ذکرشده) |
| API smoke (GET tasks/detail/checklist/workspaces) | بله | **بله** | **passed (200)** |
| تسک QA موقت runtime (share/duplicate/patch/unshare/...) | بله | **بله** | **passed** |

---

## 3. ساختار تستها

### 3.1 `service/task/tests/conftest.py` — تستهای واحد

- دیتابیس **SQLite در حافظه** (`sqlite://` + `StaticPool`)، با `PRAGMA foreign_keys=ON` برای اعمال real cascade و `ON DELETE SET NULL`.
- فیچر `db`: یک session تازه بهازای هر تست و `Base.metadata.create_all(engine)`.
- فیچر `make_user(username)`: factory ساخت کاربر.
- کامنت صریح: «No PostgreSQL server or extra packages are required beyond pytest and the service's own dependencies.»
- نیاز به `httpx` برای `TestClient` در `test_api.py`؛ با `pytest.importorskip("httpx")` محافظت شده است.

### 3.2 `service/tests/conftest.py` — تستهای یکپارچگی

- دیتابیس **PostgreSQL قابل دورریز (disposable)**، چون schema پروژه PostgreSQL-specific است (migrationها، partial index، check constraint).
- پیشفرض: `postgresql+psycopg2://halgheh:halgheh@localhost:5433/halgheh_test` — قابلoverride با `TEST_DATABASE_URL` (مطابق `service/README.md`).
- فیچر session-scope `client`:
  1. اتصال admin به `postgres` و `DROP DATABASE IF EXISTS`،
  2. `CREATE DATABASE`،
  3. `alembic upgrade head`،
  4. `TestClient(service.main.app)`،
  5. بعد از تستها `engine.dispose()` و حذف دیتابیس.
- **`DATABASE_URL` قبل از import هر ماژول `service.*` به دیتابیس تست تغییر میکند**، چون `service/core/database.py` engine را در import time میسازد.
- فیچرها: `make_user`، `owner` (`doc_owner`)، `stranger` (`doc_stranger`).
- دیتابیس توسعه هرگز لمس نمیشود.

> ⚠️ بهعلت نبود `pytest` در این محیط، هیچیک از دو ساختار بالا اجرا نشدند. جزئیات فوق از خواندن مستقیم فایلها استخراج شده است، نه از اجرا.

---

## 4. فهرست تستهای.backend موجود و پوشش واقعی

### 4.1 `service/task/tests/` — تستهای واحد (SQLite)

| فایل | تست | پوشش واقعی |
|---|---|---|
| `test_tasks.py` | `test_create_task_defaults` | پیشفرضهای ایجاد (`status=todo`) و مالکیت |
| | `test_create_task_rejects_blank_title` | رد عنوان خالی |
| | `test_create_task_rejects_inverted_dates` | رد `due_date < start_date` |
| | `test_create_task_rejects_unknown_priority` | رد مقدار نامعتبر priority |
| | `test_update_task_records_per_field_activity` | ثبت activity بهازای فیلد تغییرکرده |
| | `test_update_task_noop_when_values_unchanged` | عدم ایجاد activity در صورت عدم تغییر |
| | `test_update_task_rejects_inverted_dates_after_merge` | اعتبارسنجی بعد از merge فیلدها |
| | `test_update_task_clears_due_date_explicitly` | پاک صریح `due_date` |
| | `test_update_task_rejects_empty_body` | رد بدنه خالی |
| | `test_unrelated_user_cannot_access_or_guess_ids` | جلوگیری IDOR (404) |
| | `test_assignee_cannot_restructure_but_owner_can` | تفکیک assignee/owner در ساختار |
| | `test_actor_never_comes_from_payload` | actor همواره از احراز هویت، نه payload |
| | `test_delete_task_promotes_subtasks_and_preserves_activity` | ارتقای subtaskها و حفظ activity |
| `test_status.py` | `test_full_forward_path_sets_completed_at` | مسیر کامل وضعیتها و `completed_at` |
| | `test_reopen_clears_completed_at` | پاک شدن `completed_at` هنگام بازگشایی |
| | `test_invalid_transition_rejected` | رد transition نامعتبر |
| | `test_same_status_is_idempotent` |,idempotent بودن وضعیت یکسان |
| | `test_status_activity_recorded` | ثبت activity تغییر وضعیت |
| | `test_assignee_can_change_status_but_not_via_patch` | محدودیت مسیر تغییر وضعیت |
| | `test_unrelated_user_cannot_change_status` | منع کاربر نامرتبط |
| | `test_status_schema_validates_values` | اعتبارسنجی مقادیر schema |
| `test_hierarchy.py` | `test_subtask_creation_links_and_scopes` | ایجاد/اتصال/scope subtask |
| | `test_subtask_requires_accessible_parent` | الزام دسترسی به والد |
| | `test_direct_cycle_rejected` | رد چرخه مستقیم |
| | `test_self_parent_rejected` | رد والد بودن تسک از خود |
| | `test_deep_cycle_rejected` | رد چرخه عمیق |
| | `test_reparenting_to_unrelated_task_allowed` | جابهجایی به تسک نامرتبط مجاز |
| | `test_reparenting_requires_owner` | الزام مالک برای جابهجایی |
| | `test_task_update_rejects_parent_field` | ممنوعیت تغییر parent از PATCH عمومی |
| `test_assignments.py` | `test_assign_user_creates_active_assignment` | ایجاد انتساب active |
| | `test_duplicate_assignment_is_idempotent` |,idempotency انتساب تکراری |
| | `test_cancel_then_reassign_reactivates_same_row` | احیای همان ردیفhistorical |
| | `test_reassign_replaces_active_assignees` | جایگزینی تمام assigneeها |
| | `test_reassign_to_existing_active_assignee_is_noop` | عدم تغییر در جایگزینی تکراری |
| | `test_assign_to_unknown_user_rejected` | رد کاربر ناشناخته |
| | `test_unauthorized_assignment_attempts` | تلاشهای مجوزناکافی |
| | `test_remove_assignment_requires_owner_and_keeps_history` | حفظ تاریخچه هنگام لغو |
| | `test_listing_scopes_created_assigned_assigned_by` | scope لیستها |
| | `test_assignment_activity_payloads` | payloadای activity انتساب |
| `test_labels_comments_activity.py` | `test_label_crud_and_scoping` | CRUD و scoping label |
| | `test_duplicate_label_name_rejected` | رد نام تکراری label |
| | `test_same_label_name_allowed_across_users` | نام یکسان برای کاربران مختلف مجاز |
| | `test_label_color_validation` | اعتبارسنجی رنگ |
| | `test_attach_detach_label_idempotent_and_scoped` |,idempotency اتصال/جداسازی |
| | `test_attach_label_requires_owner` | الزام مالک |
| | `test_label_deletion_records_per_task_activity` | ثبت activity حذف label |
| | `test_comment_lifecycle` | چرخه عمر نظر |
| | `test_comment_requires_visibility` | الزام قابلیت مشاهده |
| | `test_comment_validation` | اعتبارسنجی نظر |
| | `test_activity_listing_newest_first_and_scoped` | ترتیب و scope activity |
| | `test_activity_is_not_cascaded_away` | حفظ activity پس از حذف |
| `test_api.py` | `test_unauthenticated_requests_rejected` | رد 401 |
| | `test_authenticated_request_passes` | عبور درخواست احرازشده |
| | `test_task_crud_flow` | جریان کامل CRUD |
| | `test_create_validation_errors` | خطاهای اعتبارسنجی ایجاد |
| | `test_patch_rejects_status_field` | ممنوعیت status در PATCH |
| | `test_idor_prevented_for_strangers` | جلوگیری IDOR |
| | `test_cross_team_data_isolation` | جداسازی دادههای تیمها |
| | `test_assignee_access_matrix` | ماتریس دسترسی assignee |
| | `test_assignment_endpoints` | endpointهای انتساب |
| | `test_subtask_endpoints_and_cycles` | endpointهای subtask و چرخهها |
| | `test_comment_endpoints` | endpointهای نظر |
| | `test_activity_endpoint` | endpoint activity |
| | `test_filtering_search_and_pagination` | فیلتر/جستجو/صفحهبندی |
| | `test_invalid_filter_values` | رد مقادیر نامعتبر فیلتر |
| | `test_statistics_endpoint` | endpoint آمار |
| | `test_label_endpoints` | endpointهای label |
| `test_filters.py` | `test_filter_by_status` | فیلتر status |
| | `test_filter_by_priority` | فیلتر priority |
| | `test_search_matches_title_and_description` | جستجو در عنوان/توضیح |
| | `test_due_filters` | فیلترهای due |
| | `test_pagination_totals_and_slices` | مجموع و برش صفحات |
| | `test_default_ordering_open_first_then_deadline` | چینش پیشفرض |
| | `test_sort_by_priority_uses_weight` | مرتبسازی براساس وزن priority |
| | `test_assignee_and_creator_filters` | فیلتر assignee/creator |
| | `test_parent_and_label_filters` | فیلتر parent/label |
| | `test_filter_validation_rejects_unknown_values` | رد مقادیر ناشناخته |

**اسکریپتهای همراه (تست pytest نیستند):** `run_validation.py`، `validate_postgres.py`.

### 4.2 `service/tests/` — تستهای یکپارچگی (PostgreSQL disposable)

| فایل | تست | پوشش واقعی |
|---|---|---|
| `test_task_position.py` | `test_status_insert_after_neighbor_no_collision` | درج بعد از همسایه بدون برخورد position |
| | `test_status_insert_before_neighbor` | درج قبل از همسایه |
| | `test_status_insert_between_two_tasks` | درج بین دو تسک |
| | `test_status_move_beginning_and_end` | جابهجایی به ابتدا/انتها |
| | `test_status_cross_status_and_unrelated_group` | جابهجایی بین وضعیتها |
| | `test_priority_ordering_collisions_and_moves` | ترتیب priority و برخوردها |
| | `test_position_invalid_refs_and_noop` | مرجع نامعتبر و no-op |
| `test_task_workspace_sharing.py` | `test_sharing_columns_and_constraints_exist` | وجود ستونها، CHECK و ایندکسها (`is_original`، `permission_level`، `shared_by_user_id`، `ck_...`، `uq_...`، `ix_...`) |
| | `test_created_task_has_one_original_editor_association` | دقیقاً یک ردیف اصلی با `editor` |
| | `test_second_workspace_association_defaults_to_viewer` | share دوم پیشفرض `viewer`، idempotency، جلوگیری ردیف تکراری توسط PK مرکب |
| | `test_task_deletion_keeps_other_task_checklist_intact` | حذف تسک، پاک associationها، سالم ماندن checklist تسک دیگر |
| | `test_original_association_cannot_be_removed_or_downgraded` | محافظت ردیف اصلی (400) |
| | `test_viewer_can_read_but_not_mutate_shared_task` | viewer میخواند، ولی تمام mutationها 403 |
| | `test_editor_can_edit_but_not_delete_or_share` | editor ویرایش میکند، ولی delete/share/تغییر مجوز 403 |
| | `test_unrelated_users_and_removed_members_lose_access` | غریبه 404 و عضو حذفشده 404 |
| | `test_unshare_preserves_task_and Removes destination access` (نام دقیق: `test_unshare_preserves_task_and_removes_destination_access`) |idu unshare،share تکراری، مجوز نامعتبر، دسترسی 404، حذف دوباره 404 |
| | `test_list_task_workspaces_exposes_only_authorized_workspaces` | لیست shareها فقط Workspaceهای مجاز |
| `test_task_checklist.py` | `test_checklist_crud_and_ordering` | CRUD و ترتیب checklist |
| | `test_checklist_authorization_and_task_membership` | مجوز و عضویت تسک |
| | `test_checklist_reorder_validation_and_persistence` | اعتبارسنجی و ماندگاری reorder |
| | `test_checklist_aggregates_in_task_responses` | تجمیع تعدادها در پاسخ تسک |

**سایر تستهای موجود در `service/tests` (غیرمرتبط با Tasks، خارج از دامنه این سند):** `test_docs_models.py`، `test_folders.py`، `test_docs_crud.py` — ماژول Documents را پوشش میدهند.

---

## 5. تست خودکار frontend

**هیچ تست خودکاری برای frontend وجود ندارد.** بررسیهای frontend در(this پروژه صرفاً دستی/مرورگریاند (بخش 7). فایلهایی مانند `FRONTEND_INTEGRATION.md`، `FRONTEND_ARCHITECTURE.md`، `FRONTEND_COMPONENTS.md` مستندسازیاند، نه تست.

---

## 6. طبقهبندی وضعیت تستها

| ردیف | دسته | «موجود است» | «اجرا شد» | passed | failed | «اجرا نشد» | «امکانپذیر نبود» | دلیل |
|---|---|---|---|---|---|---|---|---|
| 1 | تستهای واحد backend | بله | خیر | 0 | 0 | بله | بله | `No module named pytest`؛ نصب ممنوع |
| 2 | تستهای امنیتی sharing (`test_task_workspace_sharing.py`) | بله | خیر | 0 | 0 | بله | بله | همان دلیل — **نوشتهشده ولی اجرا نشده** |
| 3 | تستهای position/checklist (Postgres) | بله | خیر | 0 | 0 | بله | بله | همان دلیل |
| 4 | تست frontend | خیر | — | — | — | — | — | اساساً وجود ندارد |
| 5 | AST parse (تمام فایلهای Python) | بله | بله | بله | خیر | خیر | خیر | بررسی ایستا |
| 6 | AST scan فراخوانیهای `_commit` | بله | بله | بله (صفر مورد ناقص) | خیر | خیر | خیر | بررسی ایستا |
| 7 | `git diff --check` | بله | بله | بله | خیر | خیر | خیر | بررسی ایستا |
| 8 | `npm run build` | بله | بله | بله (چند فاز) | خیر | خیر | خیر | ساخت production |
| 9 | بررسی مرورگر/CDP | بله | بله | بله | خیر | خیر | خیر | موارد ذکرشده در جدول Phase 3.1 |
| 10 | API smoke | بله | بله | بله (200) | خیر | خیر | خیر | GET tasks/detail/checklist/workspaces |
| 11 | تسک QA موقت | بله | بله | بله | خیر | خیر | خیر | share/duplicate/patch/unshare/... |

**تعریف برچسبها:**
- **Test exists** — فایل تست و توابع آن در مخزنPresent است.
- **Executed** — واقعاً فراخوانی شده است.
- **Passed / Failed** — نتیجة اجرا.
- **Not executed** — وجود دارد ولی فراخوانی نشد.
- **Not possible** — محیط اجازه اجرا نمیدهد (نبود `pytest` / منع نصب).

---

## 7. جدول تأیید Phase 3.1

| مورد بررسی | نوع | نتیجه | شواهد/توضیح |
|---|---|---|---|
| رفع نقص `_commit` — اضافه شدن `conflict_status` به تمام فراخوانیها | ایستا + کد | **passed** | attach → `409`، detach → `400`، permission update → `400` |
| اسکن AST تمام فراخوانیهای `_commit` | ایستا | **passed** | صفر فراخوانی فاقد `conflict_status` |
| Parse شدن تمام فایلها با Python AST | ایستا | **passed** | خطای parse وجود ندارد |
| `git diff --check` | ایستا | **passed** | بدون خطای whitespace |
| `npm run build` | ساخت | **passed** | چند فاز بهطور موفقیتآمیز |
| Deep link (باز شدن مستقیم تسک/nav) | مرورگر/CDP | **passed** | URL state در `searchParams` |
| تعویض نما (kanban ↔ list) | مرورگر/CDP | **passed** | پارامتر `view` |
| جستجو (`q`) | مرورگر/CDP | **passed** | فیلتر در URL |
| پانل جزئیات تسک | مرورگر/CDP | **passed** | — |
| dialog ایجاد تسک | مرورگر/CDP | **passed** | پارامتر `dialog=create` |
| افزودن آیتم checklist | مرورگر/CDP | **passed** | — |
| عدم سرریز افقی (no horizontal overflow) | مرورگر/CDP | **passed** | — |
| بررسی screenshot forced-dark | مرورگر/CDP | **passed** | رنگها معکوس نشدند |
| API smoke: `GET /api/tasks` | runtime API | **passed (200)** | — |
| API smoke: `GET /api/tasks/{id}` | runtime API | **passed (200)** | — |
| API smoke: `GET /api/tasks/{id}/checklist` | runtime API | **passed (200)** | — |
| API smoke: `GET /api/tasks/{id}/workspaces` | runtime API | **passed (200)** | — |
| تسک QA موقت: share | runtime QA | **passed** | associate شدن به Workspace دوم |
| تسک QA موقت: duplicate share | runtime QA | **passed** | `attached: false`، ردیف تکراری ایجاد نشد |
| تسک QA موقت: patch permission | runtime QA | **passed** | تغییر viewer/editor |
| تسک QA موقت: unshare | runtime QA | **passed** | تسک باقی ماند، ردیف حذف شد |
| تسک QA موقت: محافظت ردیف اصلی | runtime QA | **passed** | حذف/تنزیل اصلی مسدود |
| تسک QA موقت: پاکسازی تسک کانیکال | runtime QA | **passed** | — |
| اجرای `pytest` | خودکار | **انجام نشد** | `No module named pytest` |
| نصب وابستگی | — | **انجام نشد** | طبق محدودیت، هیچ نصبی صورت نگرفت |

---

## 8. چکلیست تست دستی (عملی)

توصیه: هر ردیف را با یک کاربر «مالک» و یک Workspace دوم که کاربران viewer/editor در آن عضواند اجرا کنید.

### 8.1 چرخه عمر تسک

- [ ] ایجاد تسک با عنوان و تاریخها → وضعیت `todo` و مالکیت کاربر جاری.
- [ ] ویرایش title/description/priority/dates → activity ثبت شود.
- [ ] تلاش تغییر `status` از طریق PATCH عمومی → رد شود (باید از `PUT /status` استفاده شود).
- [ ] حذف تسک → 204؛ تسکهای فرزند به سطح بالا ارتقا یابند؛ checklist سایر تسکها سالم بماند.

### 8.2 فیلتر، جستجو و صفحهبندی

- [ ] فیلتر status/priority/due → نتیجه مطابق و پارامترها در URL.
- [ ] جستجو `q` در عنوان و توضیح.
- [ ] صفحهبندی `page`/`limit` → `total` دقیق و اسلایس صحیح.
- [ ] پارامتر نامعتبر (مثلاً `sort=foo`) → مقدار پیشفرض اعمال شود و UI نشکند.

### 8.3 نماها و URL state

- [ ] تعویض kanban ↔ list و refresh → نما حفظ شود.
- [ ] باز کردن مستقیم deep link (مثلاً `?view=list&task=12&dialog=edit&taskId=12`).
- [ ] back/forward مرورگر → فیلترها وdialogها بهدرستی تغییر کنند.
- [ ] بستن dialog → پارامترهای `dialog` و `taskId` حذف شوند.

### 8.4 Kanban و Drag-and-Drop

- [ ] جابهجایی تسک بین ستونها → وضعیت و position بهروز شود.
- [ ] درج قبل/بعد/بین همسایهها → بدون برخورد position.
- [ ] ترتیب سراسری (نه مختص به Workspace) در تمام Workspaceها یکسان بماند.

### 8.5 Checklist

- [ ] افزودن، تکمیل، ویرایش، حذف و reorder آیتمها.
- [ ] تعداد `checklist_total` / `checklist_completed` در پاسخ تسک بهروز شود.
- [ ] حذف تسک، checklist تسکهای دیگر را تحت تأثیر قرار ندهد.

### 8.6 انتساب، نظر و فعالیت

- [ ] مالک assign/reassign/remove کند؛ assignee بتواند status تغییر دهد ولی نتواند ساختار را تغییر دهد.
- [ ] نظر توسط مالک/assignee قابل ثبت و توسط غریبه نامرئی.
- [ ] لیست activity-newest-first و post-delete حفظ شود.

### 8.7 اشتراکگذاری Workspace (امنیتی)

- [ ] مالک تسک را با Workspace دوم share کند (پیشفرض `viewer`).
- [ ] share تکراری → `attached: false` و بدون ردیف اضافی.
- [ ] تغییر مجوز به `editor` و بررسی رفتارها.
- [ ] کاربر viewer: خواندن مجاز، تمام mutationها 403.
- [ ] کاربر editor: ویرایش مجاز، حذف/share/تغییر مجوز 403.
- [ ] غریبه: 404؛ کاربر حذفشده از Workspace: 404.
- [ ] حذف share → تسک باقی ماند، دسترسی مقصد 404، حذف دوباره 404.
- [ ] تلاش حذف/تنزیل ردیف اصلی → 400.
- [ ] لیست `GET /workspaces` فقط Workspaceهای مجاز را نشان دهد.

### 8.8 ظاهر و سازگاری

- [ ] عدم سرریز افقی در عرضهای مختلف.
- [ ] بررسی forced-dark: متنها قابل خواندن و پالت گرم حفظ شود.
- [ ] فوکوس کیبورد، labelها و accessible nameهایdialogها.
- [ ] ماتریس کاملresponsive (موبایل/تبلت/دسکتاپ) — **هنوز انجام نشده** (بخش 9).

---

## 9. موارد نیازمند بررسی بیشتر

1. **اجرای تستهای خودکار:** نصب `pytest` (و `httpx` برای `TestClient`) در محیطی مجاز و اجرای:
   - `python -m pytest service/task/tests -v` (SQLite)،
   - `python -m pytest service/tests/test_task_workspace_sharing.py service/tests/test_task_position.py service/tests/test_task_checklist.py -v` (Postgres disposable).
2. **تست امنیتی `test_task_workspace_sharing.py`:** ده تست نوشتهشدهاند ولی هرگز اجرا نشدند — این بالاترین اولویت تأیید است.
3. **Drag-and-Drop کامل:** تنها بخشی از جابهجاییها توسط CDP بررسی شد؛ سناریوی کامل DnD باmouse واقعی تست نشد.
4. **حذف از طریق UI:**Endpoint حذف با API بررسی شد، ولی جریان کامل dialog حذف در رابط کاربری تست نشد.
5. **نشست واقعی کاربر shareشده در Workspace متقاطع:** تستها با fixture ساختگیاند؛ یک session واقعی cross-workspace با دو حساب کاربری جداگانه بررسی نشد.
6. **ماتریس کامل responsive:** فقط موارد محدود بررسی شدند.
7. **داده legacy:** رفتار `_access_role` fallback و `_visible_clause` روی تسکهای بدون association در production تأیید نشد.
8. **مهاجرت `034` روی داده واقعی:** الگوریتم `_resolve_original_workspace` تنها از طریق خواندن کد ارزیابی شد؛ اجرا روی دیتابیس حاوی تسکهای قدیمی صورت نگرفت (و نباید بدون backup انجام شود).
9. **پاکسازی D19:** فایل `TaskSubtasksSection.jsx` و stateهای `parentOptions` باقی ماندهاند؛ مشخص کنید حذف شوند یا دوبارهActive شوند.
10. **مالکیت قابل انتقال:** در حال حاضر مالکیت تنها `created_by` است؛ نیاز محصولی برای co-owner/transfer بررسی نشد.
11. **یافته `create_subtask` (بخش 10):** بررسی runtime نشد؛ پیشنهاد اصلاح در مرحلهای که ویرایش source مجاز است (بخش 10).

---

## 10. یافته کد-بازرسی (Code-inspection finding) — `create_subtask`

| وجه | توضیح |
|---|---|
| **محل** | `service/task/service.py::create_subtask` — خطوط 479–505 (همچنین ارجاع در `router.py` خطوط 418–437). |
| **یافته** | در خط 479 فراخوانی `_admin_task(db, actor_id, parent_task_id, workspace_id=workspace_id)` بدون اختصاص نتیجه به متغیر `parent` انجام شده است، در حالی که خطوط 494، 495، 503، 505 و 508 از `parent.id` / `parent.project_id` استفاده میکنند. |
| **تأثیر احتمالی** | احتمال بروز `NameError` هنگام `POST /api/tasks/{id}/subtasks`، زیرا `parent` در محدوده تابع تعریف نشده است. کد وضعیت واقعی مشخص نیست چون اجرا نشد. |
| **نوع شواهد** | صرفاً **بازرسی استاتیک کد** (خواندن منبع). **اجرای runtime: NOT TESTED / انجام نشد.** |
| **وضعیت اصلاح** | **اصلاح نشد** — ویرایش فایلهای منبع در این مأموریت ممنوع است. |
| **توصیه** | در مرحلهای که ویرایش source مجاز است، خط 479 به `parent = _admin_task(...)` تغییر یابد؛ سپس تست `test_subtask_creation_links_and_scopes` و endpoint مربوطه اجرا شوند. |

> یادآوری: تست واحد `test_subtask_creation_links_and_scopes` و تست API `test_subtask_endpoints_and_cycles` از قبل وجود دارند ولی در این محیط اجرا نشدند؛ بنابراین این نقص توسط اجرای تست تأیید یا رد نشد.

---

*شواهد این سند: خواندن مستقیم `service/tests/conftest.py`، `service/task/tests/conftest.py`، تمام فایلهای `test_*.py` ذکرشده، `service/README.md`، و نتایج بررسیهای Phase 3.1 که توسط جلسه اصلی اجرا شدند. هیچ تستی توسط این نویسنده اجرا نشد.*
