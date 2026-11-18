import { supabase } from "./api.js";

// Clean starting point. The existing Supabase connection is preserved in api.js.
// The new MuskySocials interface will be built here from a blank front end.
const app = document.querySelector("#app");
app.dataset.backend = "connected";

try {
  const { data, error } = await supabase.auth.getSession();
  app.dataset.auth = error ? "available" : (data.session ? "signed-in" : "signed-out");
  if (error) console.error("Supabase session check:", error.message);
} catch (error) {
  app.dataset.backend = "unavailable";
  console.error("Supabase connection check failed:", error);
}