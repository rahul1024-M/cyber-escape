import type { Achievement } from "./types";

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_breach", title: "FIRST BREACH", description: "Complete Level 1 — System Access.", icon: "ShieldCheck" },
  { id: "network_ghost", title: "NETWORK GHOST", description: "Complete Level 2 — Network Breach.", icon: "Network" },
  { id: "forensic_detective", title: "FORENSIC DETECTIVE", description: "Complete Level 3 — Digital Forensics.", icon: "Search" },
  { id: "security_expert", title: "SECURITY EXPERT", description: "Complete Level 4 — Security Override.", icon: "Lock" },
  { id: "core_breaker", title: "CORE BREAKER", description: "Complete Level 5 — AI Core.", icon: "Cpu" },
  { id: "perfect_run", title: "PERFECT RUN", description: "Complete a level without a single wrong answer.", icon: "Target" },
  { id: "speed_demon", title: "SPEED DEMON", description: "Finish a timed challenge with over 10 seconds left.", icon: "Zap" },
  { id: "no_hints", title: "NO HINTS", description: "Complete a level without using a hint.", icon: "EyeOff" },
  { id: "streak_master", title: "STREAK MASTER", description: "Reach a 5-answer correct streak.", icon: "Flame" },
  { id: "digital_escape", title: "DIGITAL ESCAPE", description: "Escape the NEXUS — complete the entire game.", icon: "DoorOpen" },
  { id: "big_spender", title: "BIG SPENDER", description: "Unlock a cosmetic theme in the shop.", icon: "ShoppingBag" },
  { id: "survivor", title: "SURVIVOR", description: "Finish a level with only 1 health remaining.", icon: "HeartPulse" },
  { id: "first_blood", title: "FIRST BLOOD", description: "Complete your first challenge.", icon: "Crosshair" },
  { id: "speedrunner", title: "SPEEDRUNNER", description: "Clear a sector in under 90 seconds.", icon: "Timer" },
  { id: "forensic_master", title: "FORENSIC MASTER", description: "Clear Digital Forensics without a mistake.", icon: "Microscope" },
  { id: "security_architect", title: "SECURITY ARCHITECT", description: "Clear Security Override without a mistake.", icon: "Building" },
  { id: "boss_breaker", title: "BOSS BREAKER", description: "Defeat NEXUS AI.", icon: "Skull" },
  { id: "streak_legend", title: "STREAK LEGEND", description: "Reach a 10-answer correct streak.", icon: "Flame" },
  { id: "cyber_range_first_lab", title: "RANGE QUALIFIED", description: "Complete your first Cyber Range lab.", icon: "GraduationCap" },
  { id: "cyber_range_all_labs", title: "RANGE SPECIALIST", description: "Complete all four Cyber Range labs.", icon: "BadgeCheck" },
];

export const getAchievement = (id: string) =>
  ACHIEVEMENTS.find((a) => a.id === id);
