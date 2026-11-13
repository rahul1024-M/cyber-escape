import { createFileRoute } from "@tanstack/react-router";
import { GameProvider, useGame } from "@/game/GameProvider";
import { Hud, LevelUpModal, Toasts } from "@/components/game/Hud";
import { BootScreen, CodenameScreen, LevelSelect, MenuScreen } from "@/components/game/MenuScreens";
import { BriefingScreen, MissionReportScreen } from "@/components/game/MissionScreens";
import { FailureScreen, PlayScreen, VictoryScreen } from "@/components/game/PlayScreens";
import { CyberRangeHub, CyberRangeLabScreen } from "@/components/game/CyberRangeScreens";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cyber Escape — Hack Your Way Out" },
      { name: "description", content: "A cyberpunk security puzzle game: clear six sectors of cybersecurity challenges and escape the NEXUS network." },
      { property: "og:title", content: "Cyber Escape — Hack Your Way Out" },
      { property: "og:description", content: "Clear six sectors of real cybersecurity challenges and escape the NEXUS network." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Screens() {
  const { screen } = useGame();
  const showHud = !["boot", "codename"].includes(screen);
  return (
    <div className="grid-bg scanlines min-h-screen bg-background text-foreground">
      {showHud && <Hud />}
      <main>
        {screen === "boot" && <BootScreen />}
        {screen === "codename" && <CodenameScreen />}
        {screen === "menu" && <MenuScreen />}
        {screen === "levels" && <LevelSelect />}
        {screen === "play" && <PlayScreen />}
        {screen === "briefing" && <BriefingScreen />}
        {screen === "levelComplete" && <MissionReportScreen />}
        {screen === "victory" && <VictoryScreen />}
        {screen === "failure" && <FailureScreen />}
        {screen === "cyberRange" && <CyberRangeHub />}
        {screen === "cyberLab" && <CyberRangeLabScreen />}
      </main>
      <Toasts />
      <LevelUpModal />
    </div>
  );
}

function Index() {
  return (
    <GameProvider>
      <Screens />
    </GameProvider>
  );
}
