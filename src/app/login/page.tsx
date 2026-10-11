import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { GridLines, SiteHeader } from "@/components/SiteHeader";

export default function LoginPage() {
  return (
    <div className="frame">
      <GridLines />
      <SiteHeader variant="marketing" signedIn={false} />
      <div className="auth-wrap">
        <Suspense>
          <AuthForm mode="login" />
        </Suspense>
      </div>
    </div>
  );
}
