import { useEffect, useState } from "react";
import { Team } from "../models/Team";
import { useRouter } from "next/router";
import { LatLngLiteral } from "leaflet";

export const useTeam = (): Team | null => {
  const router = useRouter();

  const [team, setTeam] = useState<Team | null>(null);

  const [location, setLocation] = useState<LatLngLiteral>();

  useEffect(() => {
    // Skip location tracking if disabled via environment variable
    const disableTracking = process.env.NEXT_PUBLIC_DISABLE_LOCATION_TRACKING;
    console.log('NEXT_PUBLIC_DISABLE_LOCATION_TRACKING:', JSON.stringify(disableTracking), 'type:', typeof disableTracking);
    if (disableTracking === 'true' || disableTracking === '1') {
      console.log('Location tracking disabled, skipping geolocation request');
      return;
    }
    
    navigator.geolocation.getCurrentPosition(p => {
      const { latitude, longitude } = p.coords;
      setLocation({
        lat: latitude,
        lng: longitude,
      });
    }, e => {
      if (e.code === e.PERMISSION_DENIED) {
        alert("Please give us permission to track your team's location.");
      }
    })
  }, [])

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/team`, {
        method: "POST",
        body: JSON.stringify({
          location,
        })
      });
      const { team } = await res.json();
      if (team == null) {
        router.push("/");
      }
      setTeam(team);
    })();

  }, [location]);
  return team;
};
