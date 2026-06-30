import { ControlTower } from "@/components/control-tower";
import { Canvas, PageHeader } from "@/components/dashboard-shell";
import { SuperUserPanel } from "@/components/super-user-panel";
import { UploadReports } from "@/components/upload-reports";

export default function Dashboard() {
  return (
    <>
      <PageHeader title="Control Tower" />
      <Canvas>
        <UploadReports />
        <SuperUserPanel />
        <ControlTower />
      </Canvas>
    </>
  );
}
