# 01 — Personas

Three internal personas (the hierarchy is Rep → Manager → VP) and one external persona (the car buyer). Names and data are fictional.

---

## P-REP · Sofia Rossi — Sales Representative
| | |
|---|---|
| **Team / region** | Team South (Italy, Spain, Portugal), based in Milan |
| **Languages** | Italian, English, Spanish |
| **Reports to** | Marco Bianchi (Manager, Team South) |
| **Tech comfort** | High on phone and WhatsApp, low patience for slow tools |
| **Workload** | 20–40 open leads, 25–40 touches a day |

**Jobs to be done**
1. "When I start my day, show me **who to contact first** so I don't lose hot leads."
2. "When I open a lead, tell me **everything in one glance**: who they are, what they want, what's happened, what offers apply."
3. "Let me **contact them on their preferred channel** in one click and log it without retyping."
4. "Remind me of **follow-ups** so nothing goes cold."
5. "Let me **grab new unassigned leads** when I have capacity."

**Pains:** leads arrive in several inboxes, it's unclear who owns what, follow-ups get forgotten, customers are annoyed by the wrong channel, and she can't remember which promotion applies.

**Success looks like:** a high coverage %, a fast first response, and more test drives booked.

**Primary screens:** My Inbox · Lead Detail · Today's Follow-ups · Unassigned pool · Personal stats

---

## P-MGR · Lukas Becker — Sales Manager
| | |
|---|---|
| **Team / region** | Team DACH (Germany, Austria, Switzerland), based in Munich |
| **Reports to** | Isabelle Laurent (VP) |
| **Manages** | 4 reps: Anna Weber, Jonas Fischer, Lea Hoffmann, Felix Wagner |

**Jobs to be done**
1. "Show me **who's overloaded and who's idle** so I can rebalance."
2. "Show me **neglected leads** (SLA breaches, overdue, going cold) so I can intervene."
3. "Let me **assign or reassign** leads, or let the system auto-assign fairly."
4. "Show me my team's **funnel, response time, coverage and conversion** against targets."
5. "Let me **drill into a rep** and see exactly what they're working on."

**Pains:** no real-time visibility, manual lead distribution, finding out about lost deals too late.

**Primary screens:** Team Dashboard · Team Inbox · Unassigned pool · Rep drill-down · Assignment settings

---

## P-VP · Isabelle Laurent — VP of Sales, Europe
| | |
|---|---|
| **Based in** | Paris |
| **Manages** | 3 managers: Lukas Becker (DACH), Claire Martin (West: FR/BE/NL/LU), Marco Bianchi (South: IT/ES/PT) |

**Jobs to be done**
1. "Give me the **org-wide funnel and revenue** at a glance."
2. "**Compare teams and sources**: where do we win and where do we lose, and why?"
3. "Understand **customer demographics and channel preferences** so marketing can invest well."
4. "Run **offers and promotions** and see which ones actually convert."
5. "Step in on any lead or team if needed."

**Primary screens:** Org Dashboard · Team comparison · Demographics · Offers management · Any inbox (read and assign)

---

## P-BUYER · Anna Schmidt — Car Buyer (external)
| | |
|---|---|
| **Location** | Hamburg, Germany · age 31 |
| **Preferred channel** | WhatsApp, evenings · language German |
| **Situation** | Browsing the EuroDrive website for a compact SUV, has a car to trade in, wants financing |

**Jobs to be done:** "Tell the dealership I'm interested in under a minute, and get contacted **the way I prefer, in my language**, with offers that apply to me."

**Touchpoint:** the **Showroom app** (F13), a mock dealership website with an enquiry form.

---

## Seeded Org Chart (demo data)
```
Isabelle Laurent (VP, Europe)
├── Lukas Becker (Manager, Team DACH: DE/AT/CH)
│   ├── Anna Weber      (de, en)
│   ├── Jonas Fischer   (de, en)
│   ├── Lea Hoffmann    (de, fr)
│   └── Felix Wagner    (de, en, pl)
├── Claire Martin (Manager, Team West: FR/BE/NL/LU)
│   ├── Émile Dubois    (fr, en)
│   ├── Jan de Vries    (nl, en, de)
│   ├── Camille Leroy   (fr, nl)
│   └── Thomas Peeters  (nl, fr, en)
└── Marco Bianchi (Manager, Team South: IT/ES/PT)
    ├── Sofia Rossi     (it, en, es)
    ├── Marta García    (es, en)
    ├── Luca Romano     (it, en)
    └── João Silva      (pt, es, en)
```
Demo password for all seeded users: `demo1234`. Email pattern: `firstname.lastname@eurodrive.test` (accents stripped).

## Permission Summary
| Capability | Rep | Manager | VP |
|---|---|---|---|
| See leads | Own + team unassigned pool | Whole team | Whole org |
| Log activity / change stage / schedule follow-up | Own | Team | Org |
| Claim unassigned lead | ✅ (max 25 open) | ✅ | ✅ |
| Assign / reassign | ❌ | Within team | Across teams |
| Auto-assign settings | ❌ | Own team | Any team |
| Dashboard | Personal | Team | Org + team comparison |
| Demographics | ❌ | Team | Org |
| Offers: view matched | ✅ | ✅ | ✅ |
| Offers: create/edit | ❌ | ❌ | ✅ |
| Audit log | ❌ | Team | Org |

The full rules are in F03.
