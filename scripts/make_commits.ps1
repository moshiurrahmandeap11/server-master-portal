$repoDir = "d:\projects\server-master-portal"
Set-Location $repoDir

$raw = git status --porcelain -uall
$lines = $raw -split "`n" | Where-Object { $_.Trim() -ne "" }

Write-Host "Total items to commit: $($lines.Count)"

function Get-CommitMessage($path) {
    if ($path -eq ".env.example") { return "chore(env): add DATABASE_URL placeholder for PostgreSQL connection" }
    if ($path -eq "package.json") { return "chore(deps): add prisma pg adapter zod and modular backend dependencies" }
    if ($path -eq "package-lock.json") { return "chore(deps): lock updated dependencies for prisma client and pg" }
    if ($path -eq "tsconfig.json") { return "chore(typescript): configure bundler module resolution and path aliases" }
    if ($path -eq "prisma.config.ts") { return "chore(prisma): define prisma config pointing to combined schema and neon datasource" }
    if ($path -eq "scripts/prepare-schema.js") { return "chore(scripts): add automated multi-file prisma schema merger" }
    if ($path -eq "prisma/seed.ts") { return "feat(seed): create automated migration seeder from local store to neon postgres" }
    if ($path -eq "prisma/combined.prisma") { return "build(prisma): generate consolidated schema from multi-module definitions" }
    if ($path -eq "src/app.ts") { return "feat(app): configure express application with cors cookies and error handlers" }
    if ($path -eq "src/server.ts") { return "refactor(server): bootstrap server with neon postgres connection check" }
    if ($path -eq "src/app/routes/index.ts") { return "feat(routes): aggregate modular domain routes into central router" }
    
    # Prisma Schemas
    if ($path -match "prisma/schema/([^/]+)\.prisma") {
        $name = $matches[1]
        if ($name -eq "schema") { return "chore(prisma): setup multi-module root datasource and client generator" }
        if ($name -eq "enums") { return "feat(schema): define domain enums for user roles and application lifecycle" }
        return "feat(schema): define $name domain models and database relationships"
    }

    # Core infra
    if ($path -eq "src/app/config/env.ts") { return "feat(config): add typed environment configuration loader" }
    if ($path -eq "src/app/lib/prisma.ts") { return "feat(db): initialize prisma client with pg connection pool adapter" }
    if ($path -eq "src/app/interfaces/error.interface.ts") { return "feat(types): define standardized error response interfaces" }
    if ($path -eq "src/app/interfaces/requestUser.interface.ts") { return "feat(types): define authenticated request user interface" }
    if ($path -eq "src/app/interfaces/index.d.ts") { return "feat(types): augment express request interface with user context" }
    if ($path -eq "src/app/errorHelpers/AppError.ts") { return "feat(errors): create custom operational AppError class" }
    if ($path -eq "src/app/errorHelpers/handlePrismaErrors.ts") { return "feat(errors): add comprehensive prisma constraint error handlers" }
    if ($path -eq "src/app/errorHelpers/handleZodError.ts") { return "feat(errors): add zod validation error formatter" }
    if ($path -eq "src/app/shared/catchAsync.ts") { return "feat(shared): implement catchAsync higher-order handler" }
    if ($path -eq "src/app/shared/sendResponse.ts") { return "feat(shared): implement standardized json response utility" }
    if ($path -eq "src/app/utils/bcrypt.ts") { return "feat(utils): add bcrypt password hashing with legacy scrypt support" }
    if ($path -eq "src/app/utils/jwt.ts") { return "feat(utils): add dual-token jwt generation and verification utility" }
    if ($path -eq "src/app/utils/cookie.ts") { return "feat(utils): implement secure httpOnly auth cookie handlers" }
    if ($path -eq "src/app/utils/email.ts") { return "feat(utils): add nodemailer email delivery service" }
    if ($path -eq "src/app/templates/verification-email.ejs") { return "feat(templates): add email verification otp html template" }
    if ($path -eq "src/app/templates/login-otp.ejs") { return "feat(templates): add login otp email html template" }
    if ($path -eq "src/app/middleware/checkAuth.ts") { return "feat(middleware): implement dual-cookie and bearer token auth guard" }
    if ($path -eq "src/app/middleware/validateRequest.ts") { return "feat(middleware): add zod request validation middleware" }
    if ($path -eq "src/app/middleware/globalErrorHandler.ts") { return "feat(middleware): implement centralized global error handler" }
    if ($path -eq "src/app/middleware/notFound.ts") { return "feat(middleware): add 404 not found handler for undefined routes" }

    # Module files
    if ($path -match "src/app/module/([^/]+)/([^/]+)\.ts") {
        $mod = $matches[1]
        $file = $matches[2]
        if ($file -match "\.controller$") { return "feat($mod): implement $mod controller request handlers" }
        if ($file -match "\.service$") { return "feat($mod): implement $mod database service layer with prisma" }
        if ($file -match "\.route$") { return "feat($mod): define express router endpoints for $mod" }
        if ($file -match "\.interface$") { return "feat($mod): define TypeScript data contracts for $mod" }
        if ($file -match "\.validation$") { return "feat($mod): add zod request validation schemas for $mod" }
        return "feat($mod): add $file implementation"
    }

    # Generated prisma client
    if ($path -match "src/generated/prisma/(.+)") {
        $rel = $matches[1]
        return "chore(prisma-client): generate runtime client artifact for $rel"
    }

    return "chore: update $path"
}

$commitCount = 0
foreach ($line in $lines) {
    $filePath = $line.Substring(3).Trim()
    if ($filePath.StartsWith('"') -and $filePath.EndsWith('"')) {
        $filePath = $filePath.Substring(1, $filePath.Length - 2)
    }

    $msg = Get-CommitMessage $filePath
    git add "$filePath"
    git commit -m "$msg" | Out-Null
    $commitCount++
    Write-Host "[$commitCount/92] Committed: $filePath -> $msg"
}

Write-Host "Done! Successfully created $commitCount commits."
Remove-Item -Path $PSCommandPath -Force

