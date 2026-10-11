import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { GridLines, SiteHeader } from "@/components/SiteHeader";

export default function SignupPage() {
  return (
    <div className="frame">
      <GridLines />
      <SiteHeader variant="marketing" signedIn={false} />
      <div className="auth-wrap">
        <Suspense>
          <AuthForm mode="signup" />
        </Suspense>
      </div>
    </div>
  );
}
