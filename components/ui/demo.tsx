import React from "react";
import { BrowserRouter } from "react-router-dom";
import { LoginPage } from "@/components/ui/sign-in-page";

export default function Demo() {
  return (
    <BrowserRouter>
      <LoginPage />
    </BrowserRouter>
  );
}
