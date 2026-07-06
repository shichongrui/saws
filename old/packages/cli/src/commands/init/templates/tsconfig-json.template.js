"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tsconfigJsonTemplate = void 0;
const tsconfigJsonTemplate = () => `{
  "include": ["**/*.ts", "*.ts", "**/*.tsx", "global.d.ts"],
  "exclude": [".saws", "node_modules"],
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "isolatedModules": true,
    "esModuleInterop": true,
    "jsx": "react-jsx",
    "target": "ES2022",
    "module": "Node16",
    "resolveJsonModule": true,
    "strict": true,
    "allowJs": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "skipLibCheck": true
  }
}
    
`;
exports.tsconfigJsonTemplate = tsconfigJsonTemplate;
