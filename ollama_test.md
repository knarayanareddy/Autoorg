# ollama_test.md — AutoOrg Test Mission (Ollama)

---

## MISSION

Produce a brief summary of how local LLMs improve data privacy in autonomous systems.

---

## TEAM CONFIGURATION

- CEO
- Engineer
- Critic
- RatchetJudge

---

## MODEL ASSIGNMENTS
# Using the local Ollama models identified via `curl`

CEO:            ollama/gemma4:latest
Engineer:       ollama/gemma4:latest
Critic:         ollama/gemma4:latest
RatchetJudge:   ollama/gemma4:latest
DreamAgent:     ollama/gemma4:latest

---

## DOMAIN SEED MATERIAL

Local LLMs (Large Language Models) like Llama 3 or Qwen can be run entirely on-premises using tools like Ollama. 
Unlike cloud-based APIs (OpenAI, Anthropic), local execution ensures that sensitive data never leaves the organization's firewall. 
This is critical for industries like healthcare, defense, and finance.
However, local models often have smaller parameter counts (e.g., 8B, 70B) compared to cloud giants, which can lead to lower reasoning capabilities in complex planning tasks.

---

## CONSTRAINTS

1. Focus on privacy vs performance tradeoffs.
2. Max 3 paragraphs.

---

## STOPPING CRITERIA

MAX_CYCLES: 2
MAX_API_SPEND_USD: 1.00
TARGET_SCORE: 0.90

---

## CYCLE SETTINGS

MAX_WORKERS_PARALLEL: 2
