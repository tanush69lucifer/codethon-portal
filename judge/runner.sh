#!/usr/bin/env bash
# Java judge runner. Runs INSIDE the sandbox container (or on the host when JUDGE_MODE=local, dev only).
#
# stdin : tar archive containing <SRC_FILE> (e.g. Main.java) and tests/1.in .. tests/N.in
# stdout: tar archive of out/  ->  status (OK|CE), compile.txt, results.txt ("i exitCode wallMs"), i.out, i.err
# env   : SRC_FILE MAIN_CLASS N_TESTS TL_SEC MEM_MB COMPILE_TIMEOUT_SEC MAX_OUT_KB
#
# Nothing but the final tar may be written to stdout.
set -u

W="$(mktemp -d "${TMPDIR:-/tmp}/job.XXXXXX")" || exit 90
trap 'rm -rf "$W"' EXIT
cd "$W" || exit 90
tar -xf - -C "$W" 2>/dev/null || { echo "runner: bad input archive" >&2; exit 91; }
mkdir -p out classes

SRC="${SRC_FILE:-Main.java}"
CLS="${MAIN_CLASS:-Main}"
N="${N_TESTS:-0}"
TL="${TL_SEC:-2.6}"
MEM="${MEM_MB:-256}"
CT="${COMPILE_TIMEOUT_SEC:-25}"
OUTKB="${MAX_OUT_KB:-2048}"

if ! timeout -s KILL "$CT" javac -J-Xmx384m -J-XX:+UseSerialGC -encoding UTF-8 -nowarn -d classes "$SRC" > out/compile.txt 2>&1; then
  echo "CE" > out/status
else
  echo "OK" > out/status
  : > out/results.txt
  consecutive_tle=0
  for i in $(seq 1 "$N"); do
    s=$(date +%s%N)
    (
      ulimit -f "$OUTKB"
      exec timeout -s KILL "$TL" java -Xmx"${MEM}m" -Xss64m -XX:+UseSerialGC -XX:-UsePerfData \
        -Dfile.encoding=UTF-8 -cp classes "$CLS" < "tests/$i.in" > "out/$i.out" 2> "out/$i.err"
    )
    code=$?
    e=$(date +%s%N)
    wall_ms=$(( (e - s) / 1000000 ))
    echo "$i $code $wall_ms" >> out/results.txt
    truncate -s '<16384' "out/$i.err" 2>/dev/null || true

    if [ "$code" -eq 124 ] || [ "$code" -eq 137 ]; then
      consecutive_tle=$((consecutive_tle + 1))
      if [ "$consecutive_tle" -ge 2 ] && [ "$i" -lt "$N" ]; then
        # Early-exit on repeated TLE: avoid tying up worker slots for infinite loops
        next=$((i + 1))
        for j in $(seq "$next" "$N"); do
          echo "$j 124 $wall_ms" >> out/results.txt
          echo "Time Limit Exceeded" > "out/$j.err"
        done
        break
      fi
    else
      consecutive_tle=0
    fi
  done
fi
truncate -s '<16384' out/compile.txt 2>/dev/null || true

tar -cf - -C out .
