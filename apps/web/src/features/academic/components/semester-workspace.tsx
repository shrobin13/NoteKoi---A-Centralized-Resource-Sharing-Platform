"use client";

import {
  ChevronDown,
  Download,
  Eye,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ErrorState, LoadingState } from "@/components/states";
import { useMe } from "@/features/auth/hooks/use-auth";
import { useDeleteResourceAsCr, useResourceList } from "@/features/resources/hooks";
import type { ResourceListItem, ResourceType } from "@/features/resources/types";
import { env } from "@/lib/env";
import { getErrorMessage } from "@/lib/api";
import { useCourseList } from "../hooks";
import {
  useAddSemesterCourse,
  useCreateSemesterCategory,
  useRemoveSemesterCategory,
  useRemoveSemesterCourse,
  useRenameSemesterCategory,
  useSemester,
  useUpdateSemesterCourse,
} from "../semester-hooks";
import type { SemesterCategory, SemesterCourse } from "../semester-types";

type DialogState =
  | { kind: "add-course" }
  | { kind: "edit-course"; course: SemesterCourse }
  | { kind: "add-category" }
  | { kind: "rename-category"; category: SemesterCategory }
  | { kind: "remove-course"; course: SemesterCourse }
  | { kind: "remove-category"; category: SemesterCategory }
  | { kind: "delete-file"; item: ResourceListItem }
  | null;

function extension(item: ResourceListItem): string {
  const mime = item.mimeType?.toLowerCase() ?? "";
  if (mime.includes("pdf") || item.title.toLowerCase().endsWith(".pdf")) return "PDF";
  if (mime.includes("presentation") || item.title.toLowerCase().endsWith(".pptx")) return "PPTX";
  if (mime.includes("word") || item.title.toLowerCase().endsWith(".docx")) return "DOCX";
  if (mime.includes("image") || /\.(png|jpe?g|gif)$/i.test(item.title)) return "PNG";
  return "FILE";
}

function fileSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function fileRole(item: ResourceListItem, isCr: boolean, currentUserId?: string) {
  if (item.uploaderType === "TEACHER") return { label: "Teacher", className: "teacher" };
  if (item.uploaderType === "ADMIN") return { label: "Admin", className: "cr" };
  if (isCr && item.uploader.id === currentUserId) return { label: "CR", className: "cr" };
  return { label: "Student", className: "student" };
}

export function SemesterWorkspace({ semesterId }: { semesterId: string }) {
  const me = useMe();
  const user = me.data;
  const semesterQuery = useSemester(semesterId);
  const semester = semesterQuery.data;
  const isCr = user?.roles.some((role) => role.role === "CR" || role.role === "CO_CR") ?? false;
  const studentProfile = user?.profile?.kind === "student" ? user.profile : null;
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("auto");
  const [search, setSearch] = useState("");
  const [fileType, setFileType] = useState<ResourceType | "">("");
  const [addedBy, setAddedBy] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "title">("newest");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [courseChoice, setCourseChoice] = useState("");
  const [createCourseMode, setCreateCourseMode] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [teacherProfileId, setTeacherProfileId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [dialogError, setDialogError] = useState("");

  const selectedCourse = semester?.courses.find((course) => course.id === selectedCourseId) ?? semester?.courses[0];
  const categories = selectedCourse?.categories ?? [];
  const activeCategory = selectedCategoryId === "auto" ? null : categories.find((category) => category.id === selectedCategoryId) ?? null;
  const courseChoices = useCourseList({ departmentId: studentProfile?.department.id, status: "active" }, Boolean(isCr && semester));
  const availableCourseChoices = (courseChoices.data ?? []).filter((course) => !semester?.courses.some((entry) => entry.courseId === course.id));
  const availableTeachers = [...new Map((semester?.courses ?? [])
    .filter((course) => course.teacherProfileId && course.teacherName)
    .map((course) => [course.teacherProfileId as string, { id: course.teacherProfileId as string, name: course.teacherName as string }])).values()];
  const resources = useResourceList({
    ...(selectedCourse && selectedCategoryId === "auto"
      ? { courseId: selectedCourse.courseId }
      : selectedCourse && activeCategory
        ? { semesterCourseId: selectedCourse.id, categoryId: activeCategory.id }
        : { semesterCourseId: selectedCourse?.id }),
    keyword: search || undefined,
    resourceType: fileType || undefined,
    sort,
    page: 1,
    pageSize: 50,
  }, Boolean(selectedCourse));

  const addCourse = useAddSemesterCourse();
  const updateCourse = useUpdateSemesterCourse();
  const removeCourse = useRemoveSemesterCourse();
  const addCategory = useCreateSemesterCategory();
  const updateCategory = useRenameSemesterCategory();
  const removeCategory = useRemoveSemesterCategory();
  const deleteResource = useDeleteResourceAsCr();

  useEffect(() => {
    if (!semester?.courses.length) {
      setSelectedCourseId("");
      setSelectedCategoryId("auto");
      return;
    }
    if (!semester.courses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(semester.courses[0]?.id ?? "");
      setSelectedCategoryId("auto");
    }
  }, [semester, selectedCourseId]);

  const visibleResources = useMemo(() => {
    let rows = resources.data?.items ?? [];
    if (selectedCategoryId === "auto") rows = rows.filter((item) => item.uploaderType === "TEACHER" && item.audience === "PERMITTED");
    if (addedBy) rows = rows.filter((item) => item.uploaderType === addedBy);
    if (dateFilter) {
      const cutoff = Date.now() - (dateFilter === "7" ? 7 : 30) * 24 * 60 * 60 * 1000;
      rows = rows.filter((item) => new Date(item.createdAt).getTime() >= cutoff);
    }
    return rows;
  }, [resources.data?.items, selectedCategoryId, addedBy, dateFilter]);

  const openDialog = (next: DialogState) => {
    setDialogError("");
    setCourseChoice("");
    setCreateCourseMode(false);
    setCourseName(next?.kind === "edit-course" ? next.course.name : "");
    setTeacherProfileId(next?.kind === "edit-course" ? next.course.teacherProfileId ?? "" : "");
    setCategoryName(next?.kind === "rename-category" ? next.category.name : "");
    setDialog(next);
  };

  const closeDialog = () => {
    if (dialogBusy) return;
    setDialog(null);
    setDialogError("");
  };

  const dialogBusy = addCourse.isPending || updateCourse.isPending || addCategory.isPending || updateCategory.isPending || removeCourse.isPending || removeCategory.isPending || deleteResource.isPending;
  const dialogSaveDisabled = dialogBusy || (dialog?.kind === "add-course" && (courseChoices.isPending || (createCourseMode ? courseName.trim().length < 2 : !courseChoice))) || (dialog?.kind === "edit-course" && courseName.trim().length < 2) || ((dialog?.kind === "add-category" || dialog?.kind === "rename-category") && categoryName.trim().length < 2);

  const submitDialog = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dialog || !semester || !selectedCourse && !["add-course", "remove-course", "delete-file"].includes(dialog.kind)) return;
    setDialogError("");
    try {
      if (dialog.kind === "add-course") {
        const input = createCourseMode
          ? { courseName: courseName.trim(), semesterNumber: Number(semester.name.match(/\d+/)?.[0]) || undefined, teacherProfileId: teacherProfileId || null }
          : { courseId: courseChoice, teacherProfileId: teacherProfileId || null };
        const added = await addCourse.mutateAsync({ semesterId, input });
        if (typeof added === "object" && added !== null && "id" in added) {
          setSelectedCourseId(String(added.id));
          setSelectedCategoryId("auto");
        }
      } else if (dialog.kind === "edit-course") {
        await updateCourse.mutateAsync({ id: dialog.course.id, input: { courseName: courseName.trim(), teacherProfileId: teacherProfileId || null } });
      } else if (dialog.kind === "add-category") {
        if (!selectedCourse) return;
        await addCategory.mutateAsync({ semesterCourseId: selectedCourse.id, name: categoryName.trim() });
      } else if (dialog.kind === "rename-category") {
        if (!selectedCourse) return;
        await updateCategory.mutateAsync({ semesterCourseId: selectedCourse.id, categoryId: dialog.category.id, name: categoryName.trim() });
      } else if (dialog.kind === "remove-course") {
        await removeCourse.mutateAsync(dialog.course.id);
      } else if (dialog.kind === "remove-category") {
        if (!selectedCourse) return;
        await removeCategory.mutateAsync({ semesterCourseId: selectedCourse.id, categoryId: dialog.category.id });
        if (selectedCategoryId === dialog.category.id) setSelectedCategoryId("auto");
      } else if (dialog.kind === "delete-file") {
        await deleteResource.mutateAsync(dialog.item.id);
      }
      setDialog(null);
    } catch (error) {
      setDialogError(getErrorMessage(error));
    }
  };

  const onRemoveCourse = async (course: SemesterCourse) => {
    if (course.fileCount > 0) return;
    openDialog({ kind: "remove-course", course });
  };

  const onRemoveCategory = async (category: SemesterCategory) => {
    if (category.fileCount > 0 || !selectedCourse) return;
    openDialog({ kind: "remove-category", category });
  };

  const onDeleteFile = async (item: ResourceListItem) => {
    openDialog({ kind: "delete-file", item });
  };

  if (semesterQuery.isPending) return <LoadingState label="Loading semester…" />;
  if (semesterQuery.isError || !semester) {
    return <ErrorState title="Could not load semester" description={semesterQuery.error instanceof Error ? semesterQuery.error.message : undefined} onRetry={() => void semesterQuery.refetch()} />;
  }

  const renderResourceRow = (item: ResourceListItem, mobile = false) => {
    const ext = extension(item);
    const role = fileRole(item, isCr, user?.id);
    const teacherFile = item.uploaderType === "TEACHER";
    return mobile ? (
      <article className="mobile-resource-card" key={item.id}>
        <div className="mobile-resource-main">
          <span className={`file-tile ${ext.toLowerCase()}`}>{ext}</span>
          <div className="mobile-resource-title"><strong>{item.title}</strong><p>{item.uploader.name}, {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}, {fileSize(item.sizeBytes)}</p></div>
        </div>
        <div className="mobile-resource-actions">
          <Link href={`/resources/${item.id}`}>View</Link>
          <a href={`${env.apiBaseUrl}/resources/${item.id}/download`}>Download</a>
        </div>
      </article>
    ) : (
      <div className="semester-row" key={item.id}>
        <div className="file-cell">
          <span className={`file-tile ${ext.toLowerCase()}`}>{ext}</span>
          <div className="file-title-cell">
            <strong>{item.title}</strong>
            <div className="file-chips">
              {activeCategory ? <span className="category-chip">{activeCategory.name}</span> : <span className="category-chip">Sir&apos;s slides</span>}
              <span className={`type-chip ${ext.toLowerCase()}`}>{ext}</span>
              {item.versionNo ? <span className="version-chip">v{item.versionNo}</span> : null}
              {item.audience === "PLATFORM" ? <span className="everyone-chip">Everyone</span> : null}
            </div>
          </div>
        </div>
        <div className="added-by">
          <span className={`avatar ${role.className}`}>{item.uploader.name.slice(0, 1).toUpperCase()}</span>
          <div><strong>{item.uploader.name}</strong><span className={`role-chip-small ${role.className}`}>{role.label}</span></div>
        </div>
        <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time>
        <span>{fileSize(item.sizeBytes)}</span>
        <div className="row-actions">
          <Link href={`/resources/${item.id}`} aria-label={`View ${item.title}`} className="row-action"><Eye /></Link>
          <a href={`${env.apiBaseUrl}/resources/${item.id}/download`} aria-label={`Download ${item.title}`} className="row-action"><Download /></a>
          {isCr && teacherFile ? <span className="row-lock" title="Teacher files cannot be deleted by a CR"><LockKeyhole /></span> : null}
          {isCr && !teacherFile ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button type="button" className="row-action" aria-label={`More actions for ${item.title}`}><MoreHorizontal /></button></DropdownMenuTrigger>
              <DropdownMenuContent><DropdownMenuItem className="danger-action" onSelect={() => void onDeleteFile(item)}>Delete file</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="semester-page">
      <div className="semester-heading">
        <h1>{semester.name}</h1>
        <Link href={`/upload?semesterId=${semester.id}`} className="semester-upload"><Upload />Upload</Link>
      </div>

      <div className="course-tabs" role="tablist" aria-label="Courses in this semester">
        {semester.courses.map((course) => {
          return (
            <div
              className={`course-tab ${course.id === selectedCourse?.id ? "active" : ""}`}
              key={course.id}
              role="tab"
              tabIndex={0}
              aria-selected={course.id === selectedCourse?.id}
              onClick={() => { setSelectedCourseId(course.id); setSelectedCategoryId("auto"); }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedCourseId(course.id); setSelectedCategoryId("auto"); }
              }}
            >
              <span className="course-tab-copy"><strong>{course.name}</strong>{course.teacherName ? <small>{course.teacherName}</small> : null}</span>
              {isCr ? <DropdownMenu>
                <DropdownMenuTrigger asChild><button type="button" className="course-tab-more" aria-label={`Manage ${course.name}`} onClick={(event) => event.stopPropagation()}><MoreHorizontal /></button></DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => openDialog({ kind: "edit-course", course })}>Edit</DropdownMenuItem>
                  <DropdownMenuItem className="danger-action" disabled={course.fileCount > 0 || removeCourse.isPending} onSelect={() => void onRemoveCourse(course)}>
                    Remove
                    {course.fileCount > 0 ? <small>Only an empty course can be removed. Delete its files first.</small> : null}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu> : null}
            </div>
          );
        })}
        {isCr ? <button type="button" className="add-course-pill" onClick={() => openDialog({ kind: "add-course" })}><Plus />Add course</button> : null}
      </div>

      <div className="category-row" hidden={!selectedCourse}>
        <span className="category-label">CATEGORIES</span>
        <button type="button" className={`category-pill auto-category ${selectedCategoryId === "auto" ? "active" : ""}`} onClick={() => setSelectedCategoryId("auto")}>
          Sir&apos;s slides <span className="auto-category-note"><LockKeyhole />Auto</span>
        </button>
        {categories.map((category) => {
          return <div className={`category-pill-wrap ${selectedCategoryId === category.id ? "active" : ""}`} key={category.id}>
            <button type="button" className="category-pill" onClick={() => setSelectedCategoryId(category.id)}>{category.name}</button>
            {isCr && !category.isSystem ? <DropdownMenu>
              <DropdownMenuTrigger asChild><button type="button" className="category-more" aria-label={`Manage ${category.name}`}><MoreHorizontal /></button></DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => openDialog({ kind: "rename-category", category })}>Rename category</DropdownMenuItem>
                <DropdownMenuItem className="danger-action" disabled={category.fileCount > 0 || removeCategory.isPending} onSelect={() => void onRemoveCategory(category)}>
                  Remove
                  {category.fileCount > 0 ? <small>Only an empty category can be removed. Delete its files first.</small> : null}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu> : null}
          </div>;
        })}
        {isCr ? <button type="button" className="add-category-pill" disabled={!selectedCourse} onClick={() => openDialog({ kind: "add-category" })}><Plus />Add category</button> : null}
      </div>

      <section className="semester-card">
        <div className="semester-toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search files" placeholder={`Search in ${selectedCategoryId === "auto" ? "Sir's slides" : activeCategory?.name ?? "course"}`} />
          <label className="semester-filter"><select value={fileType} aria-label="Filter file type" onChange={(event) => setFileType(event.target.value as ResourceType | "")}><option value="">File type</option><option value="SLIDES">Slides</option><option value="NOTES">Notes</option><option value="QUESTION_BANK">Question bank</option><option value="ASSIGNMENT">Assignments</option><option value="BOOK">Books</option></select><ChevronDown /></label>
          <label className="semester-filter"><select value={addedBy} aria-label="Filter added by" onChange={(event) => setAddedBy(event.target.value)}><option value="">Added by</option><option value="TEACHER">Teacher</option><option value="STUDENT">Student</option><option value="ADMIN">Admin</option></select><ChevronDown /></label>
          <label className="semester-filter date-filter"><select value={dateFilter} aria-label="Filter by date" onChange={(event) => setDateFilter(event.target.value)}><option value="">Date</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select><ChevronDown /></label>
          <span className="toolbar-spacer" />
          <label className="semester-filter sort-filter"><select value={sort} aria-label="Sort files" onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A-Z</option></select><ChevronDown /></label>
        </div>

        {selectedCategoryId === "auto" ? <div className="auto-category-banner"><LockKeyhole />Files your teacher shares with your batch appear here automatically.</div> : null}
        <div className="semester-table desktop-resource-table">
          <div className="semester-column-head"><span>FILE</span><span>ADDED BY</span><span>DATE ADDED</span><span>SIZE</span><span>OPEN</span></div>
          {resources.isPending ? <div className="semester-inline-state">Loading files…</div> : null}
          {resources.isError ? <div className="semester-inline-error">{resources.error instanceof Error ? resources.error.message : "Could not load files."}<button type="button" onClick={() => void resources.refetch()}>Retry</button></div> : null}
          {visibleResources.map((item) => renderResourceRow(item))}
        </div>
        <div className="mobile-resource-list">
          {resources.isPending ? <div className="semester-inline-state">Loading files…</div> : null}
          {resources.isError ? <div className="semester-inline-error">{resources.error instanceof Error ? resources.error.message : "Could not load files."}<button type="button" onClick={() => void resources.refetch()}>Retry</button></div> : null}
          {visibleResources.map((item) => renderResourceRow(item, true))}
        </div>
        {!resources.isPending && !resources.isError && visibleResources.length === 0 ? (
          <div className="semester-empty"><strong>No files in this category yet.</strong><Link href={`/upload?semesterId=${semester.id}&semesterCourseId=${selectedCourse?.id ?? ""}&categoryId=${activeCategory?.id ?? ""}`}><Upload />Upload</Link></div>
        ) : null}
      </section>

      {dialog ? <div className="semester-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
        <section className="semester-dialog" role="dialog" aria-modal="true" aria-labelledby="semester-dialog-title">
          <div className="semester-dialog-header"><h2 id="semester-dialog-title">{dialog.kind === "add-course" ? "Add course" : dialog.kind === "edit-course" ? "Edit course" : dialog.kind === "add-category" ? "Add category" : dialog.kind === "rename-category" ? "Rename category" : dialog.kind === "remove-course" ? "Remove course" : dialog.kind === "remove-category" ? "Remove category" : "Delete file"}</h2><button type="button" aria-label="Close dialog" onClick={closeDialog} disabled={dialogBusy}><X /></button></div>
          <form onSubmit={submitDialog}>
            {dialog.kind === "add-course" ? <>
              {courseChoices.isPending ? <p className="dialog-loading">Loading courses…</p> : null}
              {courseChoices.isError ? <p className="dialog-error" role="alert">{getErrorMessage(courseChoices.error)}</p> : null}
              <label className="dialog-field"><span>Course</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><button type="button" className="dialog-course-trigger">{createCourseMode ? "Create new course" : availableCourseChoices.find((course) => course.id === courseChoice)?.name ?? "Choose a course"}<ChevronDown /></button></DropdownMenuTrigger>
                  <DropdownMenuContent className="course-choice-menu" align="start" side="bottom">
                    {availableCourseChoices.map((course) => <DropdownMenuItem key={course.id} onSelect={() => { setCreateCourseMode(false); setCourseChoice(course.id); setCourseName(""); }}>{course.name}</DropdownMenuItem>)}
                    {availableCourseChoices.length > 0 ? <div className="course-choice-divider" role="separator" /> : null}
                    <DropdownMenuItem className="course-create-choice" onSelect={() => { setCreateCourseMode(true); setCourseChoice(""); setCourseName(""); }}><Plus />Create new course</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </label>
              {createCourseMode ? <label className="dialog-field"><span>New course name</span><input autoFocus value={courseName} onChange={(event) => setCourseName(event.target.value)} placeholder="Course name" required minLength={2} maxLength={160} /></label> : null}
              <label className="dialog-field"><span>Teacher <small>Optional</small></span><select value={teacherProfileId} onChange={(event) => setTeacherProfileId(event.target.value)}><option value="">No teacher assigned</option>{availableTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
            </> : null}
            {dialog.kind === "edit-course" ? <>
              <label className="dialog-field"><span>Course name</span><input autoFocus value={courseName} onChange={(event) => setCourseName(event.target.value)} required /></label>
              <label className="dialog-field"><span>Assigned teacher <small>Optional</small></span><select value={teacherProfileId} onChange={(event) => setTeacherProfileId(event.target.value)}><option value="">No teacher assigned</option>{availableTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}</select></label>
            </> : null}
            {dialog.kind === "add-category" || dialog.kind === "rename-category" ? <label className="dialog-field"><span>Category name</span><input autoFocus value={categoryName} onChange={(event) => setCategoryName(event.target.value)} required /></label> : null}
            {dialog.kind === "remove-course" ? <p className="dialog-confirm-copy">Remove <strong>{dialog.course.name}</strong> from this semester?</p> : null}
            {dialog.kind === "remove-category" ? <p className="dialog-confirm-copy">Remove <strong>{dialog.category.name}</strong> from this course?</p> : null}
            {dialog.kind === "delete-file" ? <p className="dialog-confirm-copy">Delete <strong>{dialog.item.title}</strong>? This action cannot be undone.</p> : null}
            {dialogError ? <p className="dialog-error" role="alert">{dialogError}</p> : null}
            <div className="semester-dialog-actions"><Button type="button" variant="outline" onClick={closeDialog} disabled={dialogBusy}>Cancel</Button><Button type="submit" variant={dialog.kind === "delete-file" || dialog.kind === "remove-course" || dialog.kind === "remove-category" ? "destructive" : "default"} disabled={dialogSaveDisabled}>{dialogBusy ? "Saving…" : dialog.kind === "delete-file" ? "Delete file" : dialog.kind === "remove-course" || dialog.kind === "remove-category" ? "Remove" : "Save"}</Button></div>
          </form>
        </section>
      </div> : null}
    </div>
  );
}
