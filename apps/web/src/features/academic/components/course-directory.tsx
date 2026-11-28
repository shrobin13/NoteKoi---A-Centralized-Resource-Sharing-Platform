"use client";

import { ChevronDown, Download, Eye, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMe } from "@/features/auth/hooks/use-auth";
import { useResourceList } from "@/features/resources/hooks";
import type { ResourceListItem } from "@/features/resources/types";
import { useCourseList } from "../hooks";

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function fileExtension(item: ResourceListItem) {
  const mime = item.mimeType?.toLowerCase() ?? "";
  if (mime.includes("pdf") || item.title.toLowerCase().endsWith(".pdf")) return "PDF";
  if (mime.includes("presentation") || item.title.toLowerCase().endsWith(".pptx")) return "PPTX";
  if (mime.includes("word") || item.title.toLowerCase().endsWith(".docx")) return "DOCX";
  if (mime.includes("image") || /\.(png|jpg|jpeg|gif)$/i.test(item.title)) return "PNG";
  return "FILE";
}

export function CourseDirectory() {
  const me = useMe();
  const user = me.data;
  const student = user?.profile?.kind === "student" ? user.profile : null;
  const departmentId = student?.department.id ?? (user?.profile?.kind === "teacher" ? user.profile.departments[0]?.id : undefined);
  const semesterNumber = student?.session.name.match(/\d+/)?.[0];
  const courses = useCourseList({ departmentId, status: "active", semester: semesterNumber ? Number(semesterNumber) : undefined });
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "title">("newest");

  useEffect(() => {
    const firstCourse = courses.data?.[0];
    if (!selectedCourseId && firstCourse) setSelectedCourseId(firstCourse.id);
  }, [courses.data, selectedCourseId]);

  const resources = useResourceList({ courseId: selectedCourseId || undefined, keyword: search || undefined, sort, page: 1, pageSize: 50 }, Boolean(selectedCourseId));
  const semesterTitle = student?.session.name ?? (semesterNumber ? `Semester ${semesterNumber}` : "Semester");

  return (
    <div className="semester-page">
      <div className="semester-heading">
        <h1>{semesterTitle}</h1>
        <Link href="/upload" className="semester-upload">
          <Upload />
          Upload
        </Link>
      </div>

      {courses.data && courses.data.length > 0 ? (
        <div className="course-tabs" role="tablist">
          {courses.data.map((course) => (
            <button
              type="button"
              role="tab"
              aria-selected={course.id === selectedCourseId}
              key={course.id}
              className={`course-tab ${course.id === selectedCourseId ? "active" : ""}`}
              onClick={() => setSelectedCourseId(course.id)}
            >
              <span className="course-tab-copy"><strong>{course.name}</strong></span>
            </button>
          ))}
        </div>
      ) : null}

      <section className="semester-card">
        <div className="semester-toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search files"
            placeholder="Search in course"
          />
          <button type="button">
            File type <ChevronDown />
          </button>
          <button type="button">
            Added by <ChevronDown />
          </button>
          <button type="button">
            Date <ChevronDown />
          </button>
          <span />
          <button
            type="button"
            className="sort-button"
            onClick={() => setSort((value) => value === "newest" ? "oldest" : "newest")}
          >
            {sort === "newest" ? "Newest first" : "Oldest first"}
            <ChevronDown />
          </button>
        </div>

        <div className="semester-table desktop-resource-table">
          <div className="semester-column-head">
            <span>FILE</span>
            <span>ADDED BY</span>
            <span>DATE ADDED</span>
            <span>SIZE</span>
            <span>OPEN</span>
          </div>
          {resources.data?.items.map((item) => {
            const extension = fileExtension(item);
            const roleClass = item.uploaderType === "TEACHER" ? "teacher" : item.uploaderType === "ADMIN" ? "cr" : "student";
            const roleLabel = item.uploaderType === "TEACHER" ? "Teacher" : item.uploaderType === "ADMIN" ? "CR" : "Student";
            return (
              <div className="semester-row" key={item.id}>
                <div className="file-cell">
                  <span className={`file-tile ${extension.toLowerCase()}`}>{extension}</span>
                  <div className="file-title-cell">
                    <strong>{item.title}</strong>
                    <div className="file-chips">
                      {item.resourceType ? (
                        <span className="category-chip">
                          {item.resourceType.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}
                        </span>
                      ) : null}
                      <span className="type-chip">{extension}</span>
                      {item.versionNo ? <span className="version-chip">v{item.versionNo}</span> : null}
                      {item.audience === "PLATFORM" ? <span className="everyone-chip">Everyone</span> : null}
                    </div>
                  </div>
                </div>
                <div className="added-by">
                  <span className={`avatar ${roleClass}`}>{item.uploader.name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong>{item.uploader.name}</strong>
                    <span className={`role-chip-small ${roleClass}`}>{roleLabel}</span>
                  </div>
                </div>
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </time>
                <span>{formatSize(item.sizeBytes)}</span>
                <div className="row-actions">
                  <Link href={`/resources/${item.id}`} aria-label="View file" className="row-action">
                    <Eye />
                  </Link>
                  <a
                    href="#"
                    aria-label="Download file"
                    className="row-action"
                    onClick={(event) => event.preventDefault()}
                  >
                    <Download />
                  </a>
                </div>
              </div>
            );
          })}
          {selectedCourseId && resources.data?.items.length === 0 ? <div className="semester-empty">No approved files in this course yet.</div> : null}
        </div>

        <div className="mobile-resource-list">
          {resources.data?.items.map((item) => (
            <article className="mobile-resource-card" key={item.id}>
              <div className="mobile-resource-main">
                <span className={`file-tile ${fileExtension(item).toLowerCase()}`}>{fileExtension(item)}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {item.uploader.name},{" "}
                    {new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })},{" "}
                    {formatSize(item.sizeBytes)}
                  </p>
                </div>
              </div>
              <div className="mobile-resource-actions">
                <Link href={`/resources/${item.id}`}>View</Link>
                <button type="button" onClick={(event) => event.preventDefault()}>
                  Download
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
