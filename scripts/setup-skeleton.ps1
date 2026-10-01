foreach ($m in "org","employee","leave","attendance","payroll","recruitment","reporting") {
  foreach ($layer in "domain","application","infrastructure") {
    New-Item -ItemType Directory -Force "packages/modules/$m/src/$layer" | Out-Null
  }
  Set-Content "packages/modules/$m/src/index.ts" "export {};"
}
foreach ($p in "platform","shared-kernel") {
  New-Item -ItemType Directory -Force "packages/$p/src" | Out-Null
  Set-Content "packages/$p/src/index.ts" "export {};"
}
New-Item -ItemType Directory -Force apps/api, .github/workflows, infra | Out-Null