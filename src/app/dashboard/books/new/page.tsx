import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { NewBookForm } from "./new-book-form";
import { AnonymousRouteFallback } from "@/components/dashboard/anonymous-route-fallback";

export default function NewBookPage() {
  return (
    <AnonymousRouteFallback
      title="New book"
      description="Create a new AI-generated book from a premise, template, or idea."
    >
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-[#635bff]" />
          </div>
        }
      >
        <NewBookForm />
      </Suspense>
    </AnonymousRouteFallback>
  );
}
