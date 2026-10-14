#!/usr/bin/env bash
# Create the peopleops database and a dedicated MySQL user on the server (run once).
#   sudo ./deploy/create-db-user.sh
# Prompts for the MySQL username and password (nothing is stored in this file).
# Uses the local root account via the socket (plain `mysql`). Prints the DATABASE_URL for .env.
set -euo pipefail

DB_NAME="${DB_NAME:-peopleops}"
DB_HOST="${DB_HOST:-127.0.0.1}"

read -r -p "MySQL username to create: " DB_USER
read -r -s -p "Password for $DB_USER: " DB_PASSWORD; echo
read -r -s -p "Confirm password: " DB_PASSWORD2; echo
[ -n "$DB_USER" ] && [ -n "$DB_PASSWORD" ] || { echo "Username and password are required"; exit 1; }
[ "$DB_PASSWORD" = "$DB_PASSWORD2" ] || { echo "Passwords do not match"; exit 1; }
case "$DB_USER" in *[!A-Za-z0-9_]*) echo "Username may only contain letters, digits and _"; exit 1;; esac

# Escape for a SQL string literal
SQL_PASS=${DB_PASSWORD//\/\\}
SQL_PASS=${SQL_PASS//\'/\'\'}

# Local-only user ('localhost'); 127.0.0.1 TCP connections match it too.
mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$SQL_PASS';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$SQL_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "Done. Set this in .env (URL-encode special characters in the password):"
echo "DATABASE_URL=mysql://$DB_USER:<your password>@$DB_HOST:3306/$DB_NAME"
