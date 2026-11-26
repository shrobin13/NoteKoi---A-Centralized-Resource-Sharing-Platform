import type { Prisma } from "../../../generated/prisma/client.js";
import type { AuthUser } from "../../lib/authz.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type { FolderListResult, FolderView } from "./folder.interface.js";
import type { CreateFolderInput, ListFoldersQuery, UpdateFolderInput } from "./folder.validation.js";

const MAX_FOLDER_DEPTH = 5;
type TeacherProfile = Extract<NonNullable<AuthUser["profile"]>, { kind: "teacher" }>;

const folderSelect = {
  id: true,
  name: true,
  parentId: true,
  courseId: true,
  depth: true,
  state: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { resources: true, children: true } },
} as const;

type FolderRow = Prisma.FolderGetPayload<{ select: typeof folderSelect }>;

const requireFolderManager = (auth: AuthUser): TeacherProfile => {
  if (auth.profile?.kind !== "teacher" || auth.profile.verificationStatus !== "ACTIVE") {
    throw AppError.forbidden("Only a verified teacher can manage folders", "FORBIDDEN_ROLE");
  }

  return auth.profile;
};

const folderNotFound = (): AppError => AppError.notFound("Folder not found", "FOLDER_NOT_FOUND");

const ensureCourseScope = async (profile: TeacherProfile, courseId: string | null): Promise<void> => {
  if (!courseId) return;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, departmentId: true, isActive: true, department: { select: { isActive: true } } },
  });

  if (!course) throw AppError.notFound("Course not found", "COURSE_NOT_FOUND");
  if (!course.isActive || !course.department.isActive) {
    throw AppError.badRequest("Folders can only be linked to an active course", "COURSE_INACTIVE");
  }
  if (!profile.departmentIds.includes(course.departmentId)) {
    throw AppError.forbidden("This course is outside your assigned departments", "FORBIDDEN_SCOPE");
  }
};

const toFolderView = (row: FolderRow): FolderView => ({
  id: row.id,
  name: row.name,
  parentId: row.parentId,
  courseId: row.courseId,
  depth: row.depth,
  state: row.state,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  resourceCount: row._count.resources,
  childCount: row._count.children,
  children: [],
});

const buildTree = (rows: FolderRow[]): FolderView[] => {
  const nodes = rows.map(toFolderView);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const roots: FolderView[] = [];

  for (const node of nodes) {
    const parent = node.parentId ? nodeById.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
};

const findFolderRow = async (ownerId: string, id: string): Promise<FolderRow> => {
  const folder = await prisma.folder.findFirst({ where: { id, ownerId }, select: folderSelect });
  if (!folder) throw folderNotFound();
  return folder;
};

export const listFolders = async (auth: AuthUser, query: ListFoldersQuery): Promise<FolderListResult> => {
  const profile = requireFolderManager(auth);
  await ensureCourseScope(profile, query.courseId ?? null);

  const rows = await prisma.folder.findMany({
    where: {
      ownerId: auth.userId,
      state: "ACTIVE",
      ...(query.courseId ? { courseId: query.courseId } : {}),
    },
    orderBy: [{ depth: "asc" }, { name: "asc" }],
    select: folderSelect,
  });

  return { items: buildTree(rows) };
};

export const createFolder = async (auth: AuthUser, input: CreateFolderInput): Promise<FolderView> => {
  const profile = requireFolderManager(auth);
  const parentId = input.parentId ?? null;
  let courseId = input.courseId ?? null;
  let depth = 0;

  if (parentId) {
    const parent = await prisma.folder.findFirst({
      where: { id: parentId, ownerId: auth.userId, state: "ACTIVE" },
      select: { id: true, courseId: true, depth: true },
    });
    if (!parent) throw folderNotFound();
    if (parent.depth >= MAX_FOLDER_DEPTH) {
      throw AppError.badRequest(`Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep`, "FOLDER_DEPTH_LIMIT");
    }
    if (input.courseId !== undefined && input.courseId !== parent.courseId) {
      throw AppError.badRequest("A child folder must keep its parent's course scope", "FOLDER_SCOPE_MISMATCH");
    }

    courseId = parent.courseId;
    depth = parent.depth + 1;
  }

  await ensureCourseScope(profile, courseId);
  const created = await prisma.folder.create({
    data: { name: input.name, ownerId: auth.userId, parentId, courseId, depth },
    select: folderSelect,
  });

  return toFolderView(created);
};

const collectSubtree = (folders: { id: string; parentId: string | null; depth: number }[], rootId: string): Set<string> => {
  const ids = new Set([rootId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }

  return ids;
};

export const updateFolder = async (
  auth: AuthUser,
  id: string,
  input: UpdateFolderInput,
): Promise<FolderView> => {
  const profile = requireFolderManager(auth);
  const current = await findFolderRow(auth.userId, id);
  const parentId = input.parentId !== undefined ? input.parentId : current.parentId;
  const folders = await prisma.folder.findMany({
    where: { ownerId: auth.userId, state: "ACTIVE" },
    select: { id: true, parentId: true, depth: true, courseId: true },
  });
  const subtreeIds = collectSubtree(folders, id);
  let depth = 0;
  let courseId = current.courseId;

  if (parentId) {
    if (subtreeIds.has(parentId)) {
      throw AppError.conflict("A folder cannot be moved inside itself", "FOLDER_CYCLE");
    }

    const parent = folders.find((folder) => folder.id === parentId);
    if (!parent) throw folderNotFound();
    if (parent.courseId !== current.courseId) {
      throw AppError.badRequest("Folders must stay within the same course scope", "FOLDER_SCOPE_MISMATCH");
    }
    depth = parent.depth + 1;
    courseId = parent.courseId;
  }

  await ensureCourseScope(profile, courseId);
  const subtree = folders.filter((folder) => subtreeIds.has(folder.id));
  const maxSubtreeDepth = Math.max(current.depth, ...subtree.map((folder) => folder.depth));
  const depthDelta = depth - current.depth;

  if (maxSubtreeDepth + depthDelta > MAX_FOLDER_DEPTH) {
    throw AppError.badRequest(`Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep`, "FOLDER_DEPTH_LIMIT");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.folder.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        parentId,
        depth,
      },
      select: folderSelect,
    });

    const descendantIds = [...subtreeIds].filter((folderId) => folderId !== id);
    if (depthDelta !== 0 && descendantIds.length > 0) {
      await tx.folder.updateMany({
        where: { ownerId: auth.userId, id: { in: descendantIds } },
        data: { depth: { increment: depthDelta } },
      });
    }

    return row;
  });

  return toFolderView(updated);
};

export const deleteFolder = async (auth: AuthUser, id: string): Promise<{ id: string; deleted: true }> => {
  requireFolderManager(auth);
  const folder = await prisma.folder.findFirst({
    where: { id, ownerId: auth.userId },
    select: { id: true, _count: { select: { resources: true, children: true } } },
  });

  if (!folder) throw folderNotFound();
  if (folder._count.resources > 0 || folder._count.children > 0) {
    throw AppError.conflict("Move or remove the folder contents before deleting it", "FOLDER_NOT_EMPTY");
  }

  await prisma.folder.delete({ where: { id } });
  return { id, deleted: true };
};