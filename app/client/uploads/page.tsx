import { Suspense } from "react";
import ClientUploadsPage from "./UploadsClient";

export default function Page() {
  return (
    <Suspense fallback={<main className="container"><p>Loading uploads...</p></main>}>
      <ClientUploadsPage />
    </Suspense>
  );
}
