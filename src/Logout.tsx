/// <reference types="node" />
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

function Logout() {
    const navigate = useNavigate();
    useEffect(() => {
        const name = localStorage.getItem("name");
        const email = localStorage.getItem("email");
        if (name && email)
        {
            console.log("Logging out...");
            localStorage.removeItem("name");
            localStorage.removeItem("email");
            navigate("/");
        }
    }, []);

  return (<div></div>);
}

export default Logout;
