#!/usr/bin/env bash
# Rebuild ShopEasy and run every segment end to end (a rehearsal / smoke test).
#   ./run_all.sh            scale 1  (~2 min total)
#   ./run_all.sh 4          scale 4  (4x the rows)
set -euo pipefail
cd "$(dirname "$0")"
SCALE="${1:-1}"
dropdb --if-exists shopeasy
createdb shopeasy
psql -d shopeasy -v ON_ERROR_STOP=1 -v scale="$SCALE" -f 00_setup.sql
for f in 01_intro.sql 02_reading_plans.sql 03_free_wins.sql 04_ctes.sql \
         05_indexes.sql 99_reset.sql 06_homework.sql 06_homework_solution.sql; do
  echo; echo "################ $f ################"
  psql -d shopeasy -f "$f"
done
psql -d shopeasy -q -f 99_reset.sql
