/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-is-pure",
      comment: "Domain code imports only its own domain and shared-kernel.",
      severity: "error",
      from: { path: "^(modules/[^/]+|platform)/domain/" },
      to: {
        pathNot: "^(modules/[^/]+|platform)/domain/|^shared-kernel/",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "application-not-infrastructure",
      comment:
        "Application code depends on interfaces, never on infrastructure.",
      severity: "error",
      from: { path: "^(modules/[^/]+|platform)/application/" },
      to: { path: "^(modules/[^/]+|platform)/infrastructure/" },
    },
    {
      name: "modules-only-via-public-index",
      comment: "A module may import another module only through its index.ts.",
      severity: "error",
      from: { path: "^modules/([^/]+)/" },
      to: {
        path: "^modules/[^/]+/",
        pathNot: ["^modules/$1/", "^modules/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "ui-must-not-import-backend",
      comment:
        "Pages and components never import modules or platform. Only app/api and server/ may.",
      severity: "error",
      from: { path: "^app/(?!api/)|^components/" },
      to: { path: "^(modules|platform)/" },
    },
    {
      name: "no-prisma-outside-infrastructure",
      severity: "error",
      from: { pathNot: "/infrastructure/|^server/composition" },
      to: { path: "node_modules/(@prisma|prisma)/" },
    },
    {
      name: "shared-kernel-depends-on-nothing",
      severity: "error",
      from: { path: "^shared-kernel/" },
      to: { path: "^(modules|platform|server|app)/" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.json" },
    doNotFollow: { path: "node_modules" },
    exclude: { path: "node_modules|^\\.next|\\.test\\.ts$|\\.spec\\.ts$" },
  },
};
