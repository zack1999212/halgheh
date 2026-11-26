# کاتالوگ جامع ویژگیهای ماژول Tasks (هالگهه)

> مکمل مستند `03-FRONTEND-COMPLETE-GUIDE.md`. در اینجا **تمام** قابلیتها—از بزرگ (Kanban DnD) تا کوچک (Hide completed، toast، رفع خطای `_commit`)—فهرست شدهاند.
>
> شناسهها و endpointها به انگلیسی دقیقاً مطابق سورس نوشته شدهاند. جدول دارای **دقیقاً** ستونهای: `Feature`, `Purpose`, `User workflow`, `Backend implementation`, `Frontend implementation`, `Database impact`, `API`, `Permissions`, `Status`, `Verification` است.

## 1. قرارداد ستونها و کدهای verification

| ستون | معنی |
|---|---|
| `Feature` | نام ویژگی (فارسی + شناسهٔ انگلیسی در پرانتز) |
| `Purpose` | چرا وجود دارد |
| `User workflow` | آنچه کاربر واقعاً انجام میدهد |
| `Backend implementation` | تابع/سرویس بکند مسئول |
| `Frontend implementation` | فایل و مکانیزم فرانتاند |
| `Database impact` | اثر بر جدولها/فیلدها (`tasks`, `task_workspaces`, `task_checklist_items`, `task_comments`, `task_activities`, `task_labels`, `task_assignments`, `notifications`) |
| `API` | متد + مسیر + wrapper فرانتاند |
| `Permissions` | قانون مجوز (owner / editor / assignee / viewer) |
| `Status` | `Implemented`، `Partial`، `Unverified`، `Fix applied` یا `Not implemented (UI removed)` |
| `Verification` | کدهای اجراشده/اجرانشده (راهنمای زیر) |

**راهنمای Verification (بسیار مهم):**

| کد | معنی | وضعیت واقعی |
|---|---|---|
| `S` | بررسی سورس بهصورت read-only (`read` + `grep`) توسط عامل تهیهٔ این مستند | **اجرا شد ✓** |
| `A` | API smoke با یک تسک QA یکبارمصرف (فاز 3.1، اشترینگ workspace) | **اجرا شد ✓** (گزارش جلسهٔ اصلی) |
| `B` | production build (`npm run build` / Vite) | توسط این subagent **اجرا نشد ✗** (مجاز به اجرای ساخت نبود) |
| `AST` | بررسی پارس/AST فایلها | توسط این subagent **اجرا نشد ✗** |
| `CDP` | تست جریانهای مرورگر با Chrome DevTools Protocol | برخی جریانها **تست نشدند ✗** (جزئیات در بخش 3) |
| `T` | تست خودکار `pytest` | **اجرا نشد ✗** — `pytest` در محیط در دسترس نبود |

> بنابراین هر جایی که در جدول `S✓` دیده میشود، یعنی کد منبع خوانده و تطابق آن با ادعا بررسی شده است. `A✓` تنها جایی است که رفتار runtime واقعی (برای فاز 3.1) دیده شده است. هیچ ادعایی مبنی بر اجرای build/AST/CDP توسط این عامل نمیشود.

---

## 2. جدول جامع ویژگیها

| Feature | Purpose | User workflow | Backend implementation | Frontend implementation | Database impact | API | Permissions | Status | Verification |
|---|---|---|---|---|---|---|---|---|---|
| نمای لیست (`TaskListView`) | نمایش فشردهٔ تسکها در جدول قابل اسکن | تب «List» → ردیفها، کلیک عنوان → جزئیات | `service.list_tasks` (scope-based query) | `web/app/task/TaskListView.jsx` + `TasksPage` | خواندن از `tasks` | `GET /api/tasks` → `listTasks` | دیدن بر اساس scope + workspace | Implemented | `S✓`؛ `B✗`, `T✗` |
| نمای Kanban (`TaskBoardView`) | چیدمان بصری بر اساس وضعیت و position | تب «Kanban» → 5 ستون، کارت را جابهجا کن | `sort=position&order=asc` در `list_tasks` | `TaskBoardView.jsx` + `taskConstants.js` (`TASK_STATUSES`) | خواندن `position`, `priority_position` | `GET /api/tasks?sort=position&order=asc` | همان | Implemented | `S✓`؛ DnD توسط `CDP` کاملاً تست نشد `✗`؛ `T✗` |
| ناو presets (`nav`) | دسترسی سریع به My/Assigned by Me/Overdue/... | `TASK_NAV_ITEMS` → `?nav=my` و غیره | `scope=assigned`, `assigned_by`, `visible` + `status`/`due` | `useTaskFilters.js` + `taskConstants.js` | فقط query | `GET /api/tasks?scope=...` | بکند scope را اعمال میکند | Implemented («Team Tasks» عمداً حذف شد) | `S✓`؛ `T✗` |
| فیلتر وضعیت (`status`) | محدود کردن به یک وضعیت | Select «Status» → `?status=in_progress` | فیلتر `status` در repository | `TasksFilters.jsx` + whitelist `VALID_STATUS` | فقط query | `GET /api/tasks?status=` | — | Implemented | `S✓`؛ `T✗` |
| فیلتر اولویت (`priority`) | محدود کردن به Low/Medium/High/Urgent | Select «Priority» | فیلتر `priority` | `TasksFilters.jsx` | فقط query | `GET /api/tasks?priority=` | — | Implemented | `S✓`؛ `T✗` |
| فیلتر سررسید (`due`) | Overdue / Today / Upcoming / No due | Select «Due» | فیلتر `due` | `DUE_FILTERS` + `TasksFilters.jsx` | فقط query | `GET /api/tasks?due=` | — | Implemented | `S✓`؛ `T✗` |
| جستجو (`q`, debounce 300ms) | جستجوی عنوان/توضیحات بدون هرپرست | تایپ → 300ms later → لیست بهروز | `q` در `list_tasks` | `TasksFilters.jsx` (`SEARCH_DEBOUNCE_MS`, `latestFiltersRef`, cleanup timer) | فقط query | `GET /api/tasks?q=` | — | Implemented | `S✓`؛ `CDP` تایپ زنده تست نشد `✗`؛ `T✗` |
| مرتبسازی (`sort`, `order`) | تعیین ترتیب در لیست | «Sort» + «Order» (فقط در لیست) | `sort`/`order` در repository | `TasksFilters.jsx`, `useTaskFilters.js` | فقط query | `GET /api/tasks?sort=&order=` | — | Implemented | `S✓`؛ `T✗` |
| Position ordering (`position`, `priority_position`) | ترتیب پایدار تسکها در ستونها | Drag → position میانی ذخیره میشود | `update_task_position` (PATCH) | `TasksPage.handleMoveTask` (midpoint / ±1000) | بهروزرسانی `tasks.position` یا `tasks.priority_position` | `PATCH /api/tasks/{id}/position` → `updateTaskPosition` | تغییر وضعیت/اولویت طبق مجوز | Implemented | `S✓`؛ `A` مربوط به position نیست `—`؛ `T✗` |
| صفحهبندی / Load More | بارگذاری تدریجی بدون پرش صفحه | دکمهٔ «Load more» تا `hasMore=false` | `limit`/`offset` در `list_tasks` | `useTasks.loadMore` + dedupe by `id` + `?page`/`?limit` | فقط query | `GET /api/tasks?limit=&offset=` | — | Implemented | `S✓`؛ `CDP` چندصفحهای تست نشد `✗`؛ `T✗` |
| آمار (`TaskStatistics`) | نمای کلی Total/Open/Completed/Overdue/Due today/Completion | تب آمار بالای لیست خوانده میشود | `get_task_statistics` | `TaskStatistics.jsx` + `useTasks.loadStats` (AbortController) | aggregation خواندنی | `GET /api/tasks/statistics` → `getTaskStatistics` | فقط تسکهای قابلدیدن | Implemented | `S✓`؛ `T✗` |
| ایجاد تسک (`createTask`) | ثبت تسک جدید | Create Task → عنوان/توضیح/اولویت/تاریخ → Create | `service.create_task` + notification creator/assignees | `TaskDialog.jsx` (draft + validation + workspace_id) | INSERT `tasks` (+ notificationها) | `POST /api/tasks` → `createTask` | هر کاربر مجاز مطابق workspace | Implemented | `S✓`؛ `B✗`؛ `T✗` |
| ویرایش تسک (`updateTask`) | تغییر عنوان/توضیح/اولویت/تاریخها | Edit → تغییر فیلدها → Save changes | `service.update_task` (patch diff) | `TaskDialog.jsx` فقط فیلدهای تغییریافته را ارسال میکند | UPDATE `tasks` | `PATCH /api/tasks/{id}` → `updateTask` | owner / editor shared (بکند نهایی) | Implemented | `S✓`؛ `T✗` |
| تغییر وضعیت (`updateTaskStatus`) | انتقال بین `todo`…`cancelled` | منوی Status در کارت/ردیف، یا دکمهها در جزئیات | `service.update_task_status` + activity | `handleStatusChange` (optimistic + rollback), `TaskDetailPanel.handleStatusChange` | UPDATE `tasks.status` (+ `completed_at`, activity) | `PUT /api/tasks/{id}/status` → `updateTaskStatus` | owner/editor shared، یا assignee در حالت legacy | Implemented | `S✓`؛ `T✗` |
| تغییر اولویت (`updateTask`) | first/urgent شدن تسک | منوی Priority | `service.update_task` + activity | `handlePriorityChange` (optimistic + rollback) | UPDATE `tasks.priority` (+ `priority_position`) | `PATCH /api/tasks/{id}` → `updateTask` | owner/editor | Implemented | `S✓`؛ `T✗` |
| Drag & Drop (Pointer + touch) | جابهجایی سریع بین ستونها و داخل ستون |_pointerdown → move>8px → drop_| — (فقط فرانتاند، سپس position endpoint) | `TaskBoardView.jsx`: stable window listeners, `elementFromPoint`, `cardRectsRef`, no-op check, 250ms click suppression | تغییر position در DB از طریق endpoint | `PATCH /api/tasks/{id}/position` | همان position | Implemented | `S✓`؛ `CDP` جریان درگ کامل تست نشد `✗`؛ `T✗` |
| حذف تسک (از لیست/بورد) | حذف دائمی با تأیید | منوی سهنقطه → Delete task → ConfirmDialog → Delete permanently | `service.delete_task` + activity | `TasksPage.requestDelete/confirmDelete` (403/404messages، 404 sync محلی) | DELETE `tasks` و ردیفهای وابسته | `DELETE /api/tasks/{id}` → `deleteTask` | owner (بکند 403 میدهد) | Implemented | `S✓`؛ `T✗` |
| حذف تسک (از جزئیات) | حذف از داخل Sheet | دکمهٔ Delete → ConfirmDialog | همان | `TaskDetailPanel.handleDelete` + toast + `onDeleted` | همان | `DELETE /api/tasks/{id}` | owner | Implemented | `S✓`؛ `T✗` |
| جزئیات تسک (`TaskDetailPanel`) | نمایش تمام فیلدها + اکشنها در Sheet سمت راست | کلیک عنوان → پنل جزئیات | `get_task` (task + labels + assignments + counts) | `useTaskDetails.js` (`Promise.all` با error isolation), `Sheet`, `ScrollArea` | خواندن `tasks` و جداول مرتبط | `GET /api/tasks/{id}` → `getTask` | مشاهده بر اساس scope/association | Implemented | `S✓`؛ `CDP` برخی قسمتها تست نشد `✗`؛ `T✗` |
| Deep link (`?task=<id>`) | باز کردن مستقیم جزئیات با URL | لینک را باز کن / رفرش کن → همان تسک باز میشود | — | `TasksPage` (`taskParam` → `selectedTaskId`, `setSelectedTaskId` با `replace`) | — | `GET /api/tasks/{id}` | همان جزئیات | Implemented | `S✓` (منطق URL خوانده شد)؛ رفرش واقعی توسط `CDP` تست نشد `✗`؛ `T✗` |
| Deep link دیالوگ (`?dialog=create` / `?dialog=edit&taskId=`) | باز کردن مستقیم فرم ایجاد/ویرایش | لینک `edit` با taskId → `getTask` → فرم پرشده | — | `TasksPage` (dialogMode, dialogTaskId, `getTask` effect) | — | `GET /api/tasks/{id}` | همان ویرایش | Implemented | `S✓`؛ `T✗` |
| وضعیت URL / فیلترها (`useTaskFilters`) | قابلاشتراک و قابلبرگشت بودن نما و فیلترها | Back/Forward مرورگر → همان فیلترها برگردد | — | `useTaskFilters.js` (`normalizeFilters` with whitelist, `setFilters`, `resetPagination useCallback`) | — | query ساخته میشود | — | Implemented | `S✓` (منطق)، تست ناوبری مرورگر `CDP✗`؛ `T✗` |
| چکلیست CRUD (`TaskChecklistSection`) | افزودن/ویرایش/تکمیل/حذف آیتمها | ورودی → Add، Pencil → Edit، Checkbox، Trash2 | `service` checklist CRUD + activity | `TaskChecklistSection.jsx` (optimistic + rollback، toast) | INSERT/UPDATE/DELETE `task_checklist_items` | `GET/POST/PATCH/DELETE /api/tasks/{id}/checklist[...]` | `canEdit={isOwner}` در جزئیات | Implemented | `S✓`؛ `CDP` تست نشد `✗`؛ `T✗` |
| چکلیست reorder (mouse/touch/keyboard) | تغییر ترتیب آیتمها | GripVertical drag **یا** دکمههای ChevronUp/Down | `service.reorder_checklist_items` | Pointer Events + `setPointerCapture` + `elementFromPoint` + `moveByKeyboard` + `reorderChecklistItems` | UPDATE سریال `position` آیتمها | `PATCH /api/tasks/{id}/checklist/reorder` | owner | Implemented | `S✓`؛ تست دقیق DnD/کیبورد `CDP✗`؛ `T✗` |
| چکلیست progress و Hide completed | دیدن پیشرفت و کاهش شلوغی | نوار درصد، دکمهٔ «Hide completed (n)» | `checklist_total`/`checklist_completed` در TaskOut | `visibleItems` filter + `aria-expanded`, `sr-only` announcer | فقط خواندن countها | (بدون endpoint اضافه) | — | Implemented | `S✓`؛ `T✗` |
| چکلیست پیشنویس هنگام ایجاد | چکلیست قبل از ساخته شدن تسک | آیتمها را در فرم اضافه کن → بعد از Create ارسالشان کن | همان `create_checklist_item` | `draftChecklist` + `sessionStorage` + retry با `createdId` | INSERT `task_checklist_items` بعد از INSERT task | `POST /api/tasks/{id}/checklist` | هر کاربر ایجادکننده | Implemented | `S✓`؛ `T✗` |
| نظرات (`TaskCommentsSection`) | بحث روی تسک | متن → Comment، حذف فقط توسط نویسنده | `service.create_comment/delete_comment` + activity | `TaskCommentsSection.jsx` + `useTaskDetails.addComment/removeComment` | INSERT/DELETE `task_comments` | `GET/POST /api/tasks/{id}/comments`, `DELETE .../{commentId}` | `canComment`: owner/editor shared/assignee legacy | Implemented | `S✓`؛ `T✗` |
| تاریخچهٔ فعالیت (`TaskActivitySection`) | مشاهدهٔ تغییرات با old/new value | اسکرول پنل جزئیات → «Activity history» | `service.list_activities` (actor_id, old/new) | `describeActivity` mapping 11 action + fallback | SELECT `task_activities` | `GET /api/tasks/{id}/activities` | خواندن مطابق دسترسی تسک | Implemented | `S✓`؛ `T✗` |
| لیبلها (`attachLabel`/`detachLabel`) | دستهبندی تسک | Badgeها در فرم/جزئیاتtoggle میشوند | `service.attach_label/detach_label` (owner-only) | `TaskDialog` (diff) + `useTaskDetails.toggleLabel` | INSERT/DELETE `task_labels` | `PUT/DELETE /api/tasks/{id}/labels/{labelId}`, `GET /api/tasks/labels` | owner فقط | Implemented | `S✓`؛ `T✗` |
| تخصیصها (`assignments`) | نمایش و حذف assignee | Badge «User #id (status)» → Remove | `service.remove_assignment` (owner-only) + notification فقط هنگام create | `TaskDialog` (نمایش)، `TaskDetailPanel` (Remove)، `useTaskDetails.removeAssignee` | DELETE `task_assignments` | `GET /api/tasks/{id}`, `DELETE /api/tasks/{id}/assignments/{userId}` | owner فقط؛ **افزودن در UI وجود ندارد** (بدون endpoint دایرکتوری کاربر) | Partial | `S✓`؛ `T✗` |
| Parent/Subtask | ساختار سلسلهمراتبی | **رابط کاربری حذف شد**؛ سازگاری بکند حفظ شده است | `set_task_parent`, `list_subtasks`, `create_subtask` حفظ شدهاند | `TaskSubtasksSection.jsx` موجود است ولی توسط `TasksPage` استفاده نمیشود؛ `TaskDialog` آرگومان `allTasks`/`parentOptions` میپذیرد | `tasks.parent_task_id` | `PUT/GET /api/tasks/{id}/parent`, `GET/POST /api/tasks/{id}/subtasks` | owner (ساختار) | Not implemented (UI removed) | `S✓`؛ `A` مربوط به تست اشتراک است `—`؛ `T✗` |
| نوتیفیکیشن هنگام ایجاد | مطلع کردن creator و assigneeها | فقط بلافاصله بعد از Create | `_create_task_created_notifications`: recipient_ids = {actor} ∪ assigneeهای active | فرانتاند مستقیم کاری نمیکند، فقط `POST /api/tasks` | INSERT `notifications` (type=`task_created`) | `POST /api/tasks` | — | Implemented (فقط create، نه سایر رویدادها) | `S✓`؛ `T✗` |
| فیلتر workspace (`workspaceScope`) | محدود کردن لیست به یک workspace یا all | `WorkspaceScopeSelect` → وضعیت محلی TasksPage → `workspace_id` در query | `list_tasks(workspace_id=...)` | `TasksPage` + `useTaskFilters.query` + sync با Context | فقط query | `GET /api/tasks?workspace_id=` | بکند workspaceها را فیلتر میکند | Implemented | `S✓`؛ `T✗` |
| Context workspace | ذخیرهٔ workspace انتخابشده بین صفحات | Selector هدر ← `localStorage halgheh.activeWorkspace.<userId>` | — | `ActiveWorkspaceContext.jsx` (`ALL_WORKSPACES`, `defaultWorkspaceId`) | — | `GET /api/workspaces` | — | Implemented | `S✓`؛ `T✗` |
| Badgeهای workspace روی کارت | نشان دادن محل تسک و برجستهسازی workspace جاری | کارت بورد → Badgeها + `+n` | associationها در TaskOut | `WorkspaceBadges.jsx` (`activeWorkspaceId`, `max=2`) | خواندن associationها | (همراه TaskOut) | — | Implemented | `S✓`؛ `T✗` |
| لیست associationها (`GET workspaces`) | دیدن اینکه تسک با کدام workspaceها شریک است | Share → лیست Original/Shared | `service.list_task_workspaces` (authorized workspaces only) | `TaskDetailPanel` effect + `TaskShareDialog` (`AbortController`) | SELECT `task_workspaces` | `GET /api/tasks/{id}/workspaces?context_workspace_id=` | فقط workspaceهای مجاز | Implemented | `S✓`؛ `A✓` (QA task)؛ `T✗` |
| اشتراک با workspace (`POST`) | در دسترس قرار دادن تسک در workspace شرکا | Share dialog → workspace → Viewer/Editor → Share | `service.attach_task_to_workspace` + ws activity + `_commit(409)` | `TaskShareDialog.handleShare` (duplicate → toast «Already shared») | INSERT `task_workspaces` (is_original=false) | `POST /api/tasks/{id}/workspaces/{wid}?permission_level=` | **task owner فقط** | Implemented | `S✓`؛ `A✓` (QA task)؛ `T✗` |
| تغییر مجوز workspace (`PATCH`) |Viewer ⇄ Editor بدون حذف اشتراک | Select مجوز در ردیف Shared | `service.update_task_workspace_permission` + `_commit(400)` | `handlePermissionChange` (غیر original، جلوگیری از no-op) | UPDATE `task_workspaces.permission_level` | `PATCH /api/tasks/{id}/workspaces/{wid}?permission_level=` | **task owner فقط**؛ original قابلتغییر نیست (400) | Implemented | `S✓`؛ `A✓` (QA task)؛ `T✗` |
| لغو اشتراک (`DELETE`) | خارج کردن تسک از workspace شرکا | Trash2 → ConfirmDialog → Unshare | `service.detach_task_from_workspace` + `_commit(400)` | `handleUnshare` + toast + `shareVersion++` | DELETE `task_workspaces` | `DELETE /api/tasks/{id}/workspaces/{wid}` | **task owner فقط**؛ original قابلحذف نیست (400) | Implemented | `S✓`؛ `A✓` (QA task)؛ `T✗` |
| Share dialog (کلیت) | رابط متمرکز اشتراک | دکمهٔ Share در جزئیات → لیست/افزودن/تغییر/حذف | ترکیب چهار endpoint بالا | `TaskShareDialog.jsx` (DialogShell + ConfirmDialog + Select + toast) | همان چهار عملیات | همان چهار endpoint | Share فقط owner؛ لیست اینترفیس محدود به نقش owner/admin/editor | Implemented | `S✓`؛ `A✓` (QA task)؛ `T✗` |
| استنتاج مجوز در جزئیات | نمایش/قفل اکشنها مطابق نقش |owner→Share/Edit/Delete؛ editor shared→Edit؛ viewer→View only| `permissions.task_role` (owner/editor/assignee/project_viewer) | `TaskDetailPanel`: `isOwner`, `canEditSharedTask`, `canManage`, `canChangeStatus`, `canComment`, `legacyAssigneeRights` | — | همان endpointها | بکند مرجع نهایی مجوز است؛ UI پوششدهندهٔ نمایشی است | Implemented | `S✓`؛ `T✗` |
| رفع خطای فاز 3.1 (`_commit conflict_status`) | جلوگیری از TypeError هنگام IntegrityError و تعیین کد خطای درست | هنگام attach تکراری → 409، detach/permission Invalid → 400 | `_commit(db, *, conflict_detail, conflict_status)` + فراخوانیها | — (رفع بکند؛ فرانتاند کدها را به toast تبدیل میکند) | — | همان endpointها | — | Fix applied | `S✓` (امضا و سه فراخوانی خوانده شد)؛ `A✓` (smoke با QA task)؛ `T✗` |
| Toast (`useToast`) | بازخورد فوری موفقیت/خطا | Create/Update/Delete/Share/Unshare/Checklist → toast | — | `@/components/ui/toast.jsx` در `TasksPage`, `TaskDetailPanel`, `TaskShareDialog` | — | — | — | Implemented | `S✓`؛ `T✗` |
| حالات Loading/Error/Empty | جلوگیری از صفحهٔ خالی/گیجکننده | اسکلتون → خطا با Retry → پیام خالی | — | `LoadingState`, `ErrorState`, `EmptyState` (shared) | — | — | — | Implemented | `S✓`؛ `T✗` |
| پیشنویس sessionStorage | حفظ فرم در بسته/باز کردن مجدد دیالوگ | بستن دیالوگ → باز کردن مجدد → فیلدها برمیگردند | — | `TaskDialog` (`tasks:draft:create`, `tasks:draft:edit:<id>`, draft conflict) | — | — | — | Implemented | `S✓`؛ `T✗` |
| رسپانسیو | کار بر موبایل/تبلت/دسکتاپ | چیدمان ستونها، ردیفها، Sheet و دیالوگ تغییر میکند | — | `tasks.css` breakpointهای 1280/1100/1024/768/640 + `safe-area-inset-bottom` | — | — | — | Implemented | `S✓`؛ تست دستگاه واقعی `CDP✗`؛ `T✗` |
| رفع forced-dark (`color-scheme: only light`) | جلوگیری از تیره شدن کنترلهای native در حالت سیستم تیره | سیستم Dark → ماژول همچنان روشن و هماهنگ است | — | `tasks.css` خط 57 | — | — | — | Fix applied | `S✓`؛ `B✗` و `CDP✗` (تصویری تست نشد)؛ `T✗` |
| دسترسپذیری (a11y) | استفاده با کیبورد و screen reader | Tab/Enter/Escape، aria labelها و announcer | — | `aria-pressed`, `aria-live`, `role="alert"`, `sr-only`, `aria-grabbed`, focus-visible | — | — | — | Implemented | `S✓`؛ تست SR/CDP `✗`؛ `T✗` |
| Public share link | لینک عمومی بدون حساب | **وجود ندارد** | پیادهای نشده | گزینهای در UI وجود ندارد | — | — | — | Not implemented (gap) | `S✓` (جستجوی سورس)؛ `T✗` |
| Ordering per workspace | ترتیب مستقل تسک در هر workspace | **وجود ندارد**؛ همان `position` در همهٔ workspaceها دیده میشود | فیلد position متعلق به تسک است | `effectiveQuery` فقط sort بر `position` را قفل میکند | `tasks.position` (یک فیلد سراسری) | `PATCH /api/tasks/{id}/position` | — | Not implemented (gap) | `S✓`؛ `T✗` |
| تست self-contained اشتراک (`test_task_workspace_sharing.py`) | پوشش self-contained چهار endpoint اشتراک | — | فایل تست در `service/tests/` وجود دارد | — | — | — | — | Unverified (اجرا نشد) | `T✗` — **pytest در محیط در دسترس نبود**؛ `S✓` فقط وجود فایل تأیید شد |

---

## 3. خلاصهٔ صریح وضعیت تست و شکافها

### 3.1 آنچه واقعاً اجرا شد

1. **بررسی سورس read-only (S✓):** خواندن تمام فایلهای `web/app/task/` (صفحه، 10 کامپوننت، 4 هوک، utils، CSS)، کامپوننتهای workspace (`ActiveWorkspaceContext`, `WorkspaceBadges`, `WorkspaceScopeSelect`, `constants`) و قرارداد بکند (`router.py`, `schemas.py`, `service.py`, `permissions.py`). تمام ادعاهای جدول بر اساس همین بررسی سورس است.
2. **API smoke (A✓):** جریان اشتراک workspace (GET/POST/PATCH/DELETE) با یک تسک QA یکبارمصرف در فاز 3.1 اجرا و رفتار کدهای خطا تأیید شد.

### 3.2 آنچه اجرا نشد / عدم قطعیتها

- **`pytest` اجرا نشد ✗:** در محیط در دسترس نبود. فایل `service/tests/test_task_workspace_sharing.py` وجود دارد ولی اجرا نشده است؛ بنابراین وضعیت آن `Unverified` است.
- **`npm run build` / Vite build توسط این subagent اجرا نشد ✗** (مجاز به اجرای ساخت/تست نبودیم). بنابراین ادعای «build موفق» در این مستند وجود ندارد.
- **بررسی AST / پارس توسط این subagent اجرا نشد ✗.**
- **جریانهای مرورگر (CDP) بهطور کامل تست نشدند ✗:** بهویژه drag بورد با ماوس/تاچ، Load More چندصفحهای، رفرش با deep link `?task=`، و toggle کردن Hide completed هنگام حضور در حالت تیرهٔ سیستم.
- **فاقد قابلیت:** public share link وجود ندارد.
- **فاقد قابلیت:** ordering مستقل per-workspace وجود ندارد.
- **UI حذفشده:** parent/subtask از رابط کاربری حذف شد ولی Endpointها و سازگاری بکند حفظ شدهاند.
- **محدودیت UI:** افزودن assignee بهدلیل نبود endpoint دایرکتوری کاربر امکانپذیر نیست؛ فقط نمایش و حذف وجود دارد.
- **محدودیتUI:** Share فقط توسط مالک (creator) قابلانجام است؛ حتی editor shared نمیتواند اشتراک جدید بدهد.

### 3.3 وضعیت نهایی Phase 3.1

| مورد | وضعیت |
|---|---|
| اضافه شدن پارامتر `conflict_status` به `_commit` | **Fix applied** — امضا در `service/task/service.py:95` تأیید شد |
| attach تکراری → 409 | **Fix applied** — `service.py:1793-1797` |
| detach نامعتبر → 400 | **Fix applied** — `service.py:1833-1837` |
| permission نامعتبر → 400 | **Fix applied** — `service.py:1876-1880` |
| تست runtime | **A✓** با تسک QA یکبارمصرف |
| تستautomated | **T✗** (pytest unavailable) |

---

**پایان مستند 04.**
