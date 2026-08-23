"use client";

import type { GuestProject } from "@/lib/guest-projects";
import { Cloud, HardDrive, Trash2, X } from "lucide-react";

export interface CloudProject {
  id: string;
  name: string;
  updated_at: string;
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
  onOpenCloud: (project: CloudProject) => void;
  onDeleteLocal: (project: GuestProject) => void;
  onDeleteCloud: (project: CloudProject) => void;
}) {
  const zh = locale === "zh-CN";
  const rows = [
    ...localProjects.map((project) => ({ ...project, source: "local" as const, date: project.updatedAt })),
    ...cloudProjects.map((project) => ({ ...project, source: "cloud" as const, date: new Date(project.updated_at).getTime() }))
  ].sort((a, b) => b.date - a.date);
  return <div className="library-backdrop" role="presentation">
    <section className="project-library" role="dialog" aria-modal="true" aria-label={zh ? "项目库" : "Project library"}>
      <header><div><span className="eyebrow">{zh ? "版本化项目" : "VERSIONED PROJECTS"}</span><h2>{zh ? "项目库" : "Project library"}</h2></div><button className="icon-button" onClick={onClose} aria-label={zh ? "关闭" : "Close"}><X size={17} /></button></header>
      <div className="library-legend"><span><HardDrive size={14} />{zh ? "本浏览器" : "This browser"}</span><span><Cloud size={14} />{zh ? "私有云" : "Private cloud"}</span></div>
      <div className="project-list">{rows.length === 0 ? <p className="library-empty">{zh ? "尚无已保存项目。" : "No saved projects yet."}</p> : rows.map((project) => <article key={`${project.source}-${project.id}`}>
        <button className="project-open" onClick={() => project.source === "local" ? onOpenLocal(project) : onOpenCloud(project)}>
          {project.source === "local" ? <HardDrive size={17} /> : <Cloud size={17} />}
          <span><b>{project.name}</b><small>{new Date(project.date).toLocaleString(locale)}</small></span>
        </button>
        <button className="icon-button delete-button" onClick={() => project.source === "local" ? onDeleteLocal(project) : onDeleteCloud(project)} aria-label={`${zh ? "删除" : "Delete"} ${project.name}`}><Trash2 size={15} /></button>
      </article>)}</div>
    </section>
  </div>;
}
