# Verdicts from `/refine`. Kept: a spec that was judged before it shipped, and what it took
# to pass, is the record that answers "why does this document say what it says".
#
# What is here, per loop, under the stem `<area>-<nn>`:
#
#   <stem>.loop.json          the ledger — every round, what each gate decided, the commit it made
#   <stem>.verdict.json       the last judge's verdict; <stem>.fix.json, the last repair
#   <stem>.probe/<n>/         the round: the throwaway run the pre-implementer was given,
#                             its handoff, its verdict, and each gate's own copy of the
#                             verdict that the shared files above will overwrite
#   <stem>.probe/<n>/**/*.log the raw agent transcripts — **gitignored**, hundreds of
#                             kilobytes a gate, kept only on the machine that ran them
#
# Every gate commits what it wrote, at the moment it wrote it. A loop that stops at T0 or T1
# leaves a committed record of why, rather than a working copy of artefacts nobody can
# attribute to a round.
