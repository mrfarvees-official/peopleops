/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-is-pure",
      comment:
        "Domain code may not import npm packages, application, or infrastructure.",
      severity: "error",
      from: { path: "^packages/(modules/[^/]+|platform)/src/domain/" },
      to: {
        pathNot:
          "^packages/(modules/[^/]+|platform)/src/domain/|^packages/shared-kernel/",
      },
    },
    {
      name: "application-not-infrastructure",
      comment:
        "Application layer depends on interfaces, never on infrastructure.",
      severity: "error",
      from: { path: "^packages/(modules/[^/]+|platform)/src/application/" },
      to: { path: "^packages/(modules/[^/]+|platform)/src/infrastructure/" },
    },
    {
      name: "modules-only-via-public-index",
      comment:
        "A module may import another module only through its src/index.ts.",
      severity: "error",
      from: { path: "^packages/modules/([^/]+)/" },
      to: {
        path: "^packages/modules/[^/]+/src/",
        pathNot: [
          "^packages/modules/$1/",
          "^packages/modules/[^/]+/src/index\\.ts$",
        ],
      },
    },
    {
      name: "no-prisma-outside-infrastructure",
      severity: "error",
      from: { pathNot: "/infrastructure/|^apps/api/src/composition" },
      to: { path: "node_modules/(@prisma|prisma)/" },
    },
    {
      name: "shared-kernel-depends-on-nothing",
      severity: "error",
      from: { path: "^packages/shared-kernel/" },
      to: { path: "^packages/(modules|platform)/|^apps/" },
    },
    {
      name: "web-talks-to-api-only",
      comment:
        "The Next.js UI must not import backend modules or platform code. Use HTTP.",
      severity: "error",
      from: { path: "^apps/web/" },
      to: { path: "^packages/(modules|platform)/" },
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
    exclude: { path: "\\.test\\.ts$|\\.spec\\.ts$|node_modules|\\.next" },
  },
};
