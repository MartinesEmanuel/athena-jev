# Phase 5B — 12-case semantic upgrade review

| Case | Category | Hidden mechanism | Plausible first hypothesis | Strategy change / interaction |
|---|---|---|---|---|
| lp-01 | semantic-loop | unknown quoted escapes lose backslashes | deployment quoting or Windows path text is wrong | compare raw config with parser output and isolate value decoding |
| lp-02 | semantic-loop | transport batch size is reused as averaging population | numeric-string coercion or pending record contamination | compare normalization population with aggregate denominator |
| lp-03 | semantic-loop | collector flattens a manifest-relative nested artifact path | logger did not flush or manifest is stale | prove artifact exists, then follow producer/consumer path contract |
| lp-06 | semantic-loop | dispatch sorts priority in reverse semantic order | stage registration order or priority values are wrong | test EventBus priority contract independently of pipeline configuration |
| lp-08 | semantic-loop | generic field mapping is applied in reverse direction | server omitted fields or adapter contract is stale | inspect wire payload, field contract, and generic mapper direction |
| lp-09 | semantic-loop | textual offset is interpreted as decimal hours | date arithmetic or region table is wrong | compare configured offset text with parsed minutes |
| lp-10 | semantic-loop | availability helper conflates zero with absence | primary provider marks zero unavailable or fallback is too eager | inspect structured availability separately from value truthiness |
| lp-11 | semantic-loop | snapshot revision stays a string and is compared lexically | filesystem listing/filtering misses snapshot-10 | inspect parsed candidate type and selection semantics |
| lp-26 | mixed-debugging | normalizer and mapper are individually correct but composed in the wrong order | name formatting or imported-field normalization is broken | test components separately then inspect pipeline composition |
| lp-27 | mixed-debugging | rolling delta subtracts hits but not pre-window misses | cache counters or hit-rate formula is wrong | compare cumulative snapshots around the measurement window |
| lp-29 | mixed-debugging | default response negotiation chooses internal serializer | stored identifier or serializer mapping is wrong | compare explicit modes with default negotiation |
| lp-30 | mixed-debugging | traversal continues after an intermediate branch becomes missing | path tokenization or source shape is wrong | prove escaped path parsing works, then inspect missing-branch traversal |
