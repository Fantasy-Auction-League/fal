// SportMonks API response types (validated against IPL 2025 data)

export interface SportMonksFixture {
  id: number
  league_id: number
  season_id: number
  stage_id: number
  round: string
  localteam_id: number
  visitorteam_id: number
  starting_at: string // ISO datetime
  type: string // "T20"
  status: string // "NS", "Finished", "Cancelled"
  note: string | null // "RCB won by 7 wickets..."
  winner_team_id: number | null
  toss_won_team_id: number | null
  elected: string | null
  man_of_match_id: number | null
  super_over: boolean
  total_overs_played: number | null
}

export interface SportMonksBatting {
  id: number
  fixture_id: number
  team_id: number
  player_id: number
  scoreboard: string // "S1" or "S2"
  ball: number // balls faced
  score: number // runs scored
  four_x: number
  six_x: number
  rate: number // strike rate
  catch_stump_player_id: number | null
  runout_by_id: number | null
  batsmanout_id: number | null
  bowling_player_id: number | null
  wicket_id: number | null // dismissal type
  score_id: number | null
  fow_score: number | null
  fow_balls: number | null
  active: boolean
  sort: number
}

export interface SportMonksBowling {
  id: number
  fixture_id: number
  team_id: number
  player_id: number
  scoreboard: string
  overs: number // CRICKET NOTATION: 4.2 = 4 overs 2 balls
  medians: number // maidens (SportMonks typo)
  runs: number // runs conceded
  wickets: number
  wide: number
  noball: number
  rate: number // economy rate
  active: boolean
  sort: number
}

export interface SportMonksLineupPlayer {
  id: number
  country_id: number
  firstname: string
  lastname: string
  fullname: string
  image_path: string
  position: { id: number; name: string }
  lineup: {
    team_id: number
    captain: boolean
    wicketkeeper: boolean
    substitution: boolean
  }
}

export interface SportMonksBall {
  id: number
  fixture_id: number
  team_id: number
  ball: number // over.ball format (0.1, 0.2, ..., 1.1, ...)
  scoreboard: string
  batsman_id: number
  bowler_id: number
  batsmanout_id: number | null
  catchstump_id: number | null
  runout_by_id: number | null
  score: {
    id: number
    name: string
    runs: number
    four: boolean
    six: boolean
    bye: number
    leg_bye: number
    noball: number
    noball_runs: number
    is_wicket: boolean
    ball: boolean // counts as legal delivery
    out: boolean
  }
}

export interface SportMonksRuns {
  id: number
  fixture_id: number
  team_id: number
  inning: number
  score: number
  wickets: number
  overs: number
  pp1: string | null
}

export interface SportMonksScorecard {
  fixture: SportMonksFixture
  batting: SportMonksBatting[]
  bowling: SportMonksBowling[]
  lineup: SportMonksLineupPlayer[]
  balls?: SportMonksBall[]
  runs: SportMonksRuns[]
}
