"use client";

import { ChevronDown, Download, Eye } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "@/features/auth/hooks/use-auth";
import { useCollegeDepartments, useColleges } from "@/features/academic/hooks";
import type { CollegeDepartmentSummary } from "@/features/academic/types";
import { getErrorMessage } from "@/lib/api";
import { env } from "@/lib/env";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import type { ResourceListItem, ResourceType } from "@/features/resources/types";
import { fetchBrowseCourses, fetchBrowseFiles, fetchBrowseSemesters } from "../browse-api";
import type { BrowseCourse, BrowseScope } from "../browse-api";

const browseCategories = (course?: BrowseCourse) => ["Sir's slides", ...(course?.categories ?? [])];

function extension(item: ResourceListItem) {
  const mime = item.mimeType?.toLowerCase() ?? "";
  if (mime.includes("pdf") || item.title.toLowerCase().endsWith(".pdf")) return "PDF";
  if (mime.includes("presentation") || item.title.toLowerCase().endsWith(".pptx")) return "PPTX";
  if (mime.includes("word") || item.title.toLowerCase().endsWith(".docx")) return "DOCX";
  if (mime.includes("image") || /\.(png|jpe?g|gif)$/i.test(item.title)) return "PNG";
  return "FILE";
}

function fileSize(bytes: number | null) {
  if (bytes === null) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function OtherCollegesBrowser() {
  const me = useMe();
  const colleges = useColleges();
  const [collegeId, setCollegeId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [semester, setSemester] = useState("");
  const [fileType, setFileType] = useState<ResourceType | "">("");
  const [applied, setApplied] = useState<(BrowseScope & { resourceType: ResourceType | "" }) | null>(null);
  const [courseKey, setCourseKey] = useState("");
  const [category, setCategory] = useState("Sir's slides");
  const [search, setSearch] = useState("");
  const [toolbarType, setToolbarType] = useState<ResourceType | "">("");
  const [addedBy, setAddedBy] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const debouncedSearch = useDebouncedValue(search);
  const departments = useCollegeDepartments(collegeId);
  const semesterQuery = useQuery({
    queryKey: ["browse", "semesters", collegeId, departmentId],
    queryFn: ({ signal }) => fetchBrowseSemesters({ collegeId, departmentId }, signal),
    enabled: Boolean(collegeId && departmentId),
  });
  const scope = applied ? { collegeId: applied.collegeId, departmentId: applied.departmentId, semester: applied.semester } : null;
  const coursesQuery = useQuery({
    queryKey: ["browse", "courses", scope],
    queryFn: ({ signal }) => fetchBrowseCourses(scope as BrowseScope, signal),
    enabled: Boolean(scope),
  });
  const courses = coursesQuery.data ?? [];
  const selectedCourse = courses.find((course) => `${course.courseId}:${course.teacherProfileId ?? "none"}` === courseKey) ?? courses[0];
  const selectedCourseKey = selectedCourse ? `${selectedCourse.courseId}:${selectedCourse.teacherProfileId ?? "none"}` : "";
  const categories = browseCategories(selectedCourse);
  const filesQuery = useQuery({
    queryKey: ["browse", "files", scope, selectedCourse?.courseId, selectedCourse?.teacherProfileId, category],
    queryFn: ({ signal }) => fetchBrowseFiles({
      ...(scope as BrowseScope),
      courseId: selectedCourse?.courseId as string,
      teacherProfileId: selectedCourse?.teacherProfileId ?? null,
      categoryName: category,
    }, signal),
    enabled: Boolean(scope && selectedCourse),
  });
  const lookupError = colleges.isError ? colleges.error : departments.isError ? departments.error : semesterQuery.isError ? semesterQuery.error : null;

  useEffect(() => {
    if (courses.length && !courses.some((course) => `${course.courseId}:${course.teacherProfileId ?? "none"}` === courseKey)) {
      const first = courses[0];
      if (!first) return;
      setCourseKey(`${first.courseId}:${first.teacherProfileId ?? "none"}`);
      setCategory("Sir's slides");
    }
  }, [courses, courseKey]);

  const visibleFiles = useMemo(() => {
    let rows = filesQuery.data ?? [];
    const activeType = toolbarType || applied?.resourceType || "";
    if (activeType) rows = rows.filter((item) => item.resourceType === activeType);
    if (addedBy) rows = rows.filter((item) => item.uploader.name === addedBy);
    if (dateFilter) {
      const cutoff = Date.now() - (dateFilter === "7" ? 7 : 30) * 24 * 60 * 60 * 1000;
      rows = rows.filter((item) => new Date(item.createdAt).getTime() >= cutoff);
    }
    const term = debouncedSearch.trim().toLowerCase();
    if (term) rows = rows.filter((item) => `${item.title} ${item.uploader.name} ${item.tags.join(" ")}`.toLowerCase().includes(term));
    return [...rows].sort((a, b) => sort === "newest"
      ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [filesQuery.data, toolbarType, applied?.resourceType, addedBy, dateFilter, debouncedSearch, sort]);

  if (me.isPending) return <div className="browse-skeleton" aria-label="Loading account" />;
  if (!me.data) return <div className="browse-login-required"><h1>Other departments and colleges</h1><p>Sign in to browse shared files.</p><Link href="/login?next=%2Fcolleges">Sign in</Link></div>;

  const departmentOptions: CollegeDepartmentSummary[] = departments.data?.departments ?? [];
  const showFiles = () => {
    if (!collegeId || !departmentId || !semester) return;
    setApplied({ collegeId, departmentId, semester, resourceType: fileType });
    setCourseKey("");
    setCategory("Sir's slides");
    setToolbarType("");
    setSearch("");
    setAddedBy("");
    setDateFilter("");
    setSort("newest");
  };

  const renderRow = (item: ResourceListItem, mobile = false) => {
    const ext = extension(item);
    const roleClass = item.uploaderType === "TEACHER" ? "teacher" : "student";
    const date = new Date(item.createdAt);
    return mobile ? (
      <article className="mobile-resource-card" key={item.id}>
        <div className="mobile-resource-main"><span className={`file-tile ${ext.toLowerCase()}`}>{ext}</span><div className="min-w-0"><strong>{item.title}</strong><p>{item.uploader.name}, {date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, {fileSize(item.sizeBytes)}</p></div></div>
        <div className="mobile-resource-visibility"><span>Visibility</span><span className={`visibility-chip ${item.audience === "PLATFORM" ? "platform" : "college"}`}>{item.audience === "PLATFORM" ? "Everyone" : "My college"}</span></div>
        <div className="mobile-resource-actions"><Link href={`/resources/${item.id}`}>View</Link><a href={`${env.apiBaseUrl}/resources/${item.id}/download`}>Download</a></div>
      </article>
    ) : (
      <div className="semester-row" key={item.id}>
        <div className="file-cell"><span className={`file-tile ${ext.toLowerCase()}`}>{ext}</span><div className="file-title-cell"><strong>{item.title}</strong><div className="file-chips"><span className="category-chip">{category}</span><span className={`type-chip ${ext.toLowerCase()}`}>{ext}</span>{item.versionNo ? <span className="version-chip">v{item.versionNo}</span> : null}</div></div></div>
        <div className="added-by"><span className={`avatar ${roleClass}`}>{item.uploader.name.slice(0, 1).toUpperCase()}</span><div><strong>{item.uploader.name}</strong><span className={`role-chip-small ${roleClass}`}>Teacher</span></div></div>
        <div className="resource-visibility-cell"><span className={`visibility-chip ${item.audience === "PLATFORM" ? "platform" : "college"}`}>{item.audience === "PLATFORM" ? "Everyone" : "My college"}</span></div>
        <time dateTime={item.createdAt}>{date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</time><span>{fileSize(item.sizeBytes)}</span>
        <div className="row-actions"><Link href={`/resources/${item.id}`} aria-label={`View ${item.title}`} className="row-action"><Eye /></Link><a href={`${env.apiBaseUrl}/resources/${item.id}/download`} aria-label={`Download ${item.title}`} className="row-action"><Download /></a></div>
      </div>
    );
  };

  return <div className="semester-page browse-page">
    <div className="semester-heading"><h1>Other departments and colleges</h1></div>
    <section className="browse-filter-card" aria-label="Browse filters">
      <label className="browse-field"><span>College <b>*</b></span><span className="browse-select required"><select value={collegeId} onChange={(event) => { setCollegeId(event.target.value); setDepartmentId(""); setSemester(""); setApplied(null); }}><option value="">Select college</option>{(colleges.data ?? []).map((college) => <option key={college.id} value={college.id}>{college.name}</option>)}</select><ChevronDown /></span></label>
      <label className="browse-field"><span>Department <b>*</b></span><span className="browse-select required"><select value={departmentId} disabled={!collegeId} onChange={(event) => { setDepartmentId(event.target.value); setSemester(""); setApplied(null); }}><option value="">Select department</option>{departmentOptions.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select><ChevronDown /></span></label>
      <label className="browse-field"><span>Semester <b>*</b></span><span className="browse-select required"><select value={semester} disabled={!departmentId} onChange={(event) => { setSemester(event.target.value); setApplied(null); }}><option value="">Select semester</option>{(semesterQuery.data ?? []).map((name) => <option key={name} value={name}>{name}</option>)}</select><ChevronDown /></span></label>
      <label className="browse-field"><span>File type</span><span className="browse-select"><select value={fileType} onChange={(event) => setFileType(event.target.value as ResourceType | "")}><option value="">Any type</option><option value="SLIDES">Slides</option><option value="NOTES">Notes</option><option value="QUESTION_BANK">Question bank</option><option value="ASSIGNMENT">Assignments</option><option value="BOOK">Books</option><option value="OTHER">Other</option></select><ChevronDown /></span></label>
      <button type="button" className="browse-show-button" disabled={!collegeId || !departmentId || !semester} onClick={showFiles}>Show files</button>
    </section>
    {lookupError ? <div className="browse-error" role="alert">{getErrorMessage(lookupError)}</div> : null}

    {!applied ? <div className="browse-empty">Choose a college, department and semester to see files.</div> : null}
    {applied && coursesQuery.isPending ? <div className="browse-skeleton" aria-label="Loading courses and files" /> : null}
    {applied && coursesQuery.isError ? <div className="browse-error" role="alert">{getErrorMessage(coursesQuery.error)}</div> : null}
    {applied && coursesQuery.data ? <>
      {courses.length ? <div className="course-tabs" role="tablist" aria-label="Courses in this semester">{courses.map((course) => {
        const key = `${course.courseId}:${course.teacherProfileId ?? "none"}`;
        return <button type="button" className={`course-tab ${key === selectedCourseKey ? "active" : ""}`} role="tab" aria-selected={key === selectedCourseKey} key={key} onClick={() => { setCourseKey(key); setCategory("Sir's slides"); }}><span className="course-tab-copy"><strong>{course.name}</strong><small>{course.teacherName ?? "Teacher not assigned"}</small></span></button>;
      })}</div> : null}
      {selectedCourse ? <div className="category-row"><span className="category-label">CATEGORIES</span>{categories.map((name) => <button type="button" key={name} className={`browse-category-pill ${category === name ? "active" : ""}`} onClick={() => setCategory(name)}>{name}</button>)}</div> : null}
      <section className="semester-card browse-card">
        {selectedCourse ? <div className="semester-toolbar browse-toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search files" placeholder={`Search in ${category}`} />
          <label className="semester-filter"><select value={toolbarType} aria-label="Filter file type" onChange={(event) => setToolbarType(event.target.value as ResourceType | "")}><option value="">File type</option><option value="SLIDES">Slides</option><option value="NOTES">Notes</option><option value="QUESTION_BANK">Question bank</option><option value="ASSIGNMENT">Assignments</option><option value="BOOK">Books</option><option value="OTHER">Other</option></select><ChevronDown /></label>
          <label className="semester-filter"><select value={addedBy} aria-label="Filter added by" onChange={(event) => setAddedBy(event.target.value)}><option value="">Added by</option>{[...new Set((filesQuery.data ?? []).map((item) => item.uploader.name))].map((name) => <option key={name} value={name}>{name}</option>)}</select><ChevronDown /></label>
          <label className="semester-filter date-filter"><select value={dateFilter} aria-label="Filter by date" onChange={(event) => setDateFilter(event.target.value)}><option value="">Date</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select><ChevronDown /></label>
          <span className="toolbar-spacer" />
          <label className="semester-filter sort-filter"><select value={sort} aria-label="Sort files" onChange={(event) => setSort(event.target.value as typeof sort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select><ChevronDown /></label>
        </div> : null}
        <div className="browse-info-strip">Pick a college, department and semester (* required). You see files shared with everyone, plus college-only files if you switched that on in your settings.</div>
        {filesQuery.isPending && selectedCourse ? <div className="browse-skeleton browse-files-skeleton" aria-label="Loading files" /> : null}
        {filesQuery.isError ? <div className="browse-error" role="alert">{getErrorMessage(filesQuery.error)}</div> : null}
        {filesQuery.data ? <>
          <div className="semester-table desktop-resource-table"><div className="semester-column-head"><span>FILE</span><span>ADDED BY</span><span>VISIBILITY</span><span>DATE ADDED</span><span>SIZE</span><span>OPEN</span></div>{visibleFiles.map((item) => renderRow(item))}</div>
          <div className="mobile-resource-list">{visibleFiles.map((item) => renderRow(item, true))}</div>
          {visibleFiles.length === 0 ? <div className="semester-empty">No files found.</div> : null}
        </> : null}
        {courses.length === 0 && !coursesQuery.isPending ? <div className="semester-empty">No files found.</div> : null}
      </section>
    </> : null}
  </div>;
}