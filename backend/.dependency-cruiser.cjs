// eslint-disable-next-line @typescript-eslint/no-require-imports -- dependency-cruiser loads this configuration as CommonJS.
const { readdirSync } = require('node:fs');
module.exports = {
  "forbidden": [
    ...readdirSync('src/modules', { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => ({
      name: `no-other-context-adapters-${entry.name}`, severity: 'error',
      from: { path: `^src/modules/${entry.name}/` },
      to: { path: `^src/modules/(?!${entry.name}/)[^/]+/infrastructure/` },
    })),
    {
      "name": "no-cycles",
      "severity": "error",
      "from": {},
      "to": {
        "circular": true
      }
    },
    {
      "name": "no-unresolved",
      "severity": "error",
      "from": {},
      "to": {
        "couldNotResolve": true
      }
    },
    {
      "name": "domain-is-pure",
      "severity": "error",
      "from": {
        "path": "^src/.*/domain/"
      },
      "to": {
        "pathNot": "^src/(modules/[^/]+/domain/|shared/domain/)"
      }
    },
    {
      "name": "application-no-adapters",
      "severity": "error",
      "from": {
        "path": "^src/.*/application/"
      },
      "to": {
        "path": "(^src/.*(infrastructure|presentation)/|^src/(app|bootstrap)/|node_modules/(react|react-dom|next|mongoose|zod|zustand|keycloak-js|jose|@mui)/)"
      }
    },
    {
      "name": "presentation-no-adapters",
      "severity": "error",
      "from": {
        "path": "^src/(modules/[^/]+/presentation/|shared/(components|hooks|theme|presentation)/)"
      },
      "to": {
        "path": "^src/.*/infrastructure/"
      }
    },
    {
      "name": "internal-no-composition",
      "severity": "error",
      "from": {
        "path": "^src/(modules|shared)/"
      },
      "to": {
        "path": "^src/(app|bootstrap)/"
      }
    },
    {
      "name": "no-cross-application",
      "severity": "error",
      "from": {
        "path": "^src/"
      },
      "to": {
        "path": "(^|/)(frontend|backend)/src/"
      }
    }
  ],
  "options": {
    "doNotFollow": {
      "path": "node_modules"
    },
    "tsPreCompilationDeps": true,
    "tsConfig": {
      "fileName": "tsconfig.json"
    },
    "enhancedResolveOptions": {
      "exportsFields": [
        "exports"
      ],
      "conditionNames": [
        "import",
        "require",
        "node",
        "default"
      ]
    }
  }
};
