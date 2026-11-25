// SPEC-001 R18: every UI string lives here (English in v1) so a Bangla/Hindi UI can be added in M6

const strings = {
  appName: "Clipper",
  tagline: "Long videos into short clips — in Bangla, English and Hindi.",
  devMode: "dev mode",
  version: "Version",
  languagesHeading: "Languages",
  milestone: "M0 foundation: the window and IPC work. Next: docs/product/roadmap.md",
} as const;

export { strings };
