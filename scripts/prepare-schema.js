import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaDir = path.join(__dirname, '../prisma/schema');
const targetFile = path.join(__dirname, '../prisma/combined.prisma');

function getAllPrismaFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllPrismaFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.prisma') && file !== 'schema.prisma') {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

console.log('Combining multi-module Prisma schemas (auth, candidate, job, application, wallet, exam, cms, admin)...');

const mainSchemaPath = path.join(schemaDir, 'schema.prisma');
let combinedContent = '';

if (fs.existsSync(mainSchemaPath)) {
  combinedContent += fs.readFileSync(mainSchemaPath, 'utf8') + '\n\n';
}

const prismaFiles = getAllPrismaFiles(schemaDir);
prismaFiles.forEach((filePath) => {
  const relPath = path.relative(schemaDir, filePath);
  combinedContent += `// -----------------------------------------------------\n`;
  combinedContent += `// Module: ${relPath}\n`;
  combinedContent += `// -----------------------------------------------------\n`;
  combinedContent += fs.readFileSync(filePath, 'utf8') + '\n\n';
});

fs.writeFileSync(targetFile, combinedContent);
console.log(`Successfully combined ${prismaFiles.length} schema files into prisma/combined.prisma!`);
