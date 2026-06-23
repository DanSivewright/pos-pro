import { ControlTower } from "@/components/control-tower";
import { Canvas, PageHeader } from "@/components/dashboard-shell";
import { UploadReports } from "@/components/upload-reports";

export default function Dashboard() {
  return (
    <>
      <PageHeader title="Control Tower" />
      <Canvas>
        <UploadReports />
        <ControlTower />
      </Canvas>
    </>
  );
}
