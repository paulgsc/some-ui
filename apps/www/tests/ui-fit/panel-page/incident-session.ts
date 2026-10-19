const SOURCE = {
  title:
    "Designing Data-Intensive Applications, chapter 9: Consistency and Consensus",
  author: "Martin Kleppmann",
  year: 2017,
  where:
    "Chapter 9, the section on fault-tolerant consensus and epoch numbering",
  url: "https://dataintensive.net/",
  minutes: 3,
}

const LONG =
  "The primary acknowledged the write to the client as soon as it was in its own memory, before any replica had it, and then the network split the primary from the other two machines for forty seconds while traffic kept arriving."

/**
 * A session file written to stress the phone's layout rather than to teach:
 * every screen carries the most it may (a pinned job, a body, a panel of
 * four rows, five options with long labels, a five-point rubric), so each
 * kind of screen is as full as a file can make it. It passes the schema;
 * the content lint is not its concern.
 */
export const STRESS_SESSION = {
  title: "Three incidents, one take: the writes a majority never held",
  oneLine:
    "Pick what happened in each production incident before anything is shown, then tell one of them aloud as you would to a colleague.",
  session: { kind: "incident", budgetMinutes: 10 },
  glossary: {
    quorum:
      "the smallest group of machines whose agreement counts as a decision",
    fsync: "the call that makes the disk, not just memory, hold a write",
  },
  start: "i1",
  screens: {
    i1: {
      type: "info",
      pinned:
        "The job: work out why each system broke, then say it in your own words.",
      title: "Three incidents, one take",
      body: `${LONG}\n\nA wrong pick or a "Not sure" is kept as evidence. It sends you to the page that explains that incident, and that round waits until you have read it.`,
      glosses: ["quorum", "fsync"],
      actions: [{ label: "Start with incident 1", next: "r1" }],
    },
    r1: {
      type: "choice",
      pinned:
        "The job: say which rule the cluster broke when the acknowledged writes vanished.",
      title: "Incident 1: the writes that vanished after the failover",
      body: LONG,
      panel: {
        title: "Who holds what when the network heals",
        rows: [
          {
            who: "Old primary",
            holds: "writes 1 to 900, acknowledged, in memory only",
          },
          { who: "Replica A", holds: "writes 1 to 400, fsynced to disk" },
          {
            who: "Replica B",
            holds: "writes 1 to 400, fsynced to disk, now primary",
          },
          { who: "Client", holds: "an OK for every one of writes 1 to 900" },
        ],
      },
      provenance:
        "Adapted from a public postmortem; the numbers are changed and the mechanism is not.",
      glosses: ["quorum"],
      cites: "g1",
      options: [
        {
          label:
            "The OK came before a majority held the write, so the new primary never had writes 401 to 900",
          next: "p1",
          correct: true,
        },
        {
          label:
            "Three machines is too small a cluster for a majority vote to mean anything",
          next: "g1",
          correct: false,
          feedback:
            "Three machines can hold a majority of two. The size was enough; what the OK waited for was not.",
        },
        {
          label:
            "The writes sat in memory because fsync was turned off on the replicas, not on the primary",
          next: "g1",
          correct: false,
          feedback:
            "The replicas fsynced every write they had. The writes that vanished never reached them at all.",
        },
        {
          label:
            "The failover timeout was too short, so the replicas elected a new primary while the old one was still healthy",
          next: "g1",
          correct: false,
          feedback:
            "A longer timeout delays the election but does not give the new primary writes it never received.",
        },
        { label: "Not sure", next: "g1", abstain: true },
      ],
    },
    g1: {
      type: "reading",
      tags: ["placement"],
      title: "A page for incident 1",
      primer:
        "Read the passage on what an acknowledgement promises, then come back to the round with new numbers.",
      source: SOURCE,
      passage: `${LONG} ${LONG}`,
      glosses: ["quorum"],
      actions: [
        { label: "Read now", next: "v1", effect: "read" },
        { label: "Save it; this round waits", next: "r2", effect: "save" },
        { label: "Skip; this round waits", next: "r2" },
      ],
    },
    v1: {
      type: "choice",
      returnOf: "r1",
      cites: "g2",
      onHesitate: "g2",
      title: "Incident 1 again, a different cluster of five machines",
      body: LONG,
      options: [
        {
          label: "The primary and any two of the four replicas must hold it",
          next: "r2",
          correct: true,
        },
        {
          label: "The primary alone, once it has fsynced the write",
          next: "g2",
          correct: false,
          feedback: "One machine is not a majority of five.",
        },
        { label: "Not sure", next: "g2", abstain: true },
      ],
    },
    r2: {
      type: "choice",
      pinned: "The job: say what a leader must hear before it answers a read.",
      title: "Incident 2: a leader that did not know it had been replaced",
      cites: "g2",
      body: LONG,
      options: [
        {
          label:
            "Hear back from a majority that it is still the leader for this term",
          next: "p1",
          correct: true,
        },
        {
          label: "Compare its term with the one in its own log",
          next: "g2",
          correct: false,
          feedback:
            "Its own log cannot tell it that a newer term began elsewhere.",
        },
        { label: "Not sure", next: "g2", abstain: true },
      ],
    },
    g2: {
      type: "reading",
      tags: ["placement"],
      title: "A page for incident 2",
      primer: "Read the passage on leader leases and terms.",
      source: SOURCE,
      passage: LONG,
      actions: [
        { label: "Read now", next: "k1", effect: "read" },
        { label: "Save it; this round waits", next: "k1", effect: "save" },
        { label: "Skip; this round waits", next: "k1" },
      ],
    },
    p1: {
      type: "reading",
      title: "Where this is written",
      primer:
        "You can say why the vote was not enough. Read the account next to your own wording and see which words differ. Optional.",
      source: SOURCE,
      passage: LONG,
      actions: [
        { label: "Read now", next: "k1", effect: "read" },
        { label: "Save for a Read session", next: "k1", effect: "save" },
        { label: "Skip", next: "k1" },
      ],
    },
    k1: {
      type: "choice",
      tags: ["speak"],
      title: "Your take",
      body: "Pick one incident to tell aloud, as you would to a colleague who missed the postmortem.",
      options: [
        {
          label: "Incident 1: the writes that vanished after the failover",
          next: "t1",
        },
        { label: "No take today", next: "e1", abstain: true },
      ],
    },
    t1: {
      type: "record",
      pinned:
        "The job: tell incident 1 so a colleague could explain it after you.",
      title: "Incident 1, out loud",
      body: LONG,
      glosses: ["quorum", "fsync"],
      prompt:
        "Why did the writes the client was told were safe disappear, and what would have kept them?",
      maxSeconds: 60,
      rubric: [
        "The OK was sent before a majority of the machines held the write",
        "The new primary was elected from machines that never received writes 401 to 900",
        "Waiting for a quorum to acknowledge before answering the client would have kept them",
        "fsync on the replicas was not the problem, because the writes never reached them",
        "A longer failover timeout only delays the loss; it does not prevent it",
      ],
      weakIfFewerThan: 3,
      next: "e1",
      onWeak: "g3",
    },
    g3: {
      type: "reading",
      tags: ["placement"],
      title: "A page for your take, incident 1",
      primer: "Read the passage again, then say it once more next time.",
      source: SOURCE,
      passage: LONG,
      actions: [
        { label: "Read now", next: "e1", effect: "read" },
        { label: "Save it; the take waits", next: "e1", effect: "save" },
        { label: "Skip; the take waits", next: "e1" },
      ],
    },
    e1: { type: "end" },
  },
}
