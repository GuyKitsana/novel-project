import { redirect } from "next/navigation";

export default function BooksRedirectPage() {
  redirect("/search");
}
