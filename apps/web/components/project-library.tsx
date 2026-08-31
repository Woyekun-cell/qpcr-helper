"use client";

import type { GuestProject } from "@/lib/guest-projects";
import { Cloud, HardDrive, Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";

export interface CloudProject {
  id: string;
  name: string;
  updated_at: string;
  versions?: Array<{ id: string; version: number; created_at: string }>;
}

export function ProjectLibrary({
  locale,
  localProjects,
  cloudProjects,
  onClose,
  onOpenLocal,
  onOpenCloud,
  onDeleteLocal,
  onDeleteCloud
}: {
  locale: "zh-CN" | "en";
  localProjects: GuestProject[];
  cloudProjects: CloudProject[];
  onClose: () => void;
  onOpenLocal: (project: GuestProject) => void;
  onOpenCloud: (project: CloudProject, versionId?: string) => void;
  onDeleteLocal: (project: GuestProject) => void;
  onDeleteCloud: (project: CloudProject) => void;
}) {
  const zh = locale === "zh-CN";
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
        .filter((element) => !element.hasAttribute("disabled"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  const rows = [
    ...localProjects.map((project) => ({ ...project, source: "local" as const, date: project.updatedAt })),
    ...cloudProjects.map((project) => ({ ...project, source: "cloud" as const, date: new Date(project.updated_at).getTime() }))
  ].sort((a, b) => b.date - a.date);
  return <div className="library-backdrop" role="presentation">
    <section ref={dialogRef} className="project-library" role="dialog" aria-modal="true" aria-label={zh ? "项目库" : "Project library"}>
      <header><div><span className="eyebrow">{zh ? "版本化项目" : "VERSIONED PROJECTS"}</span><h2>{zh ? "项目库" : "Project library"}</h2></div><button ref={closeRef} className="icon-button" onClick={onClose} aria-label={zh ? "关闭" : "Close"}><X size={17} /></button></header>
      <div className="library-legend"><span><HardDrive size={14} />{zh ? "本浏览器" : "This browser"}</span><span><Cloud size={14} />{zh ? "私有云" : "Private cloud"}</span></div>
      <div className="project-list">{rows.length === 0 ? <p className="library-empty">{zh ? "尚无已保存项目。" : "No saved projects yet."}</p> : rows.map((project) => <article key={`${project.source}-${project.id}`}>
        <button className="project-open" onClick={() => project.source === "local" ? onOpenLocal(project) : onOpenCloud(project)}>
          {project.source === "local" ? <HardDrive size={17} /> : <Cloud size={17} />}
          <span><b>{project.name}</b><small>{new Date(project.date).toLocaleString(locale)}{project.versions?.length ? ` · ${project.versions.length} ${zh ? "个版本" : "versions"}` : ""}</small></span>
        </button>
        <button className="icon-button delete-button" onClick={() => project.source === "local" ? onDeleteLocal(project) : onDeleteCloud(project)} aria-label={`${zh ? "删除" : "Delete"} ${project.name}`}><Trash2 size={15} /></button>
        {project.source === "local" && (project.versions?.length ?? 0) > 1 && <label className="version-picker"><span>{zh ? "打开历史版本" : "Open historical version"}</span><select defaultValue="" onChange={(event) => {
          const version = project.versions?.find((candidate) => candidate.id === event.target.value);
          if (version) onOpenLocal({ ...project, payload: version.payload });
        }}><option value="" disabled>{zh ? "选择版本" : "Select version"}</option>{project.versions?.map((version, index) => <option key={version.id} value={version.id}>v{index + 1} · {new Date(version.createdAt).toLocaleString(locale)}</option>)}</select></label>}
        {project.source === "cloud" && (project.versions?.length ?? 0) > 1 && <label className="version-picker"><span>{zh ? "打开历史版本" : "Open historical version"}</span><select defaultValue="" onChange={(event) => onOpenCloud(project, event.target.value)}><option value="" disabled>{zh ? "选择版本" : "Select version"}</option>{project.versions?.map((version) => <option key={version.id} value={version.id}>v{version.version} · {new Date(version.created_at).toLocaleString(locale)}</option>)}</select></label>}
      </article>)}</div>
    </section>
  </div>;
}
