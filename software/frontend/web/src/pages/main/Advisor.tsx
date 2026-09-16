import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  ArrowBack,
  CheckCircleOutline,
  InfoOutlined,
  ReportProblemOutlined,
} from "@mui/icons-material";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AdvisorResult } from "../../services/advisorService";
import {
  answerFieldProblem,
  createFieldProblem,
  FieldProblem,
  getFieldProblem,
  getFieldProblems,
  resolveFieldProblem,
} from "../../services/problemService";
import { getFarmFields, getFarms } from "../../services/farmService";

const adviceView = (advice?: AdvisorResult) => ({
  headline: advice?.headline || advice?.summary || "Checking your field",
  explanation:
    advice?.what_may_be_happening || advice?.possible_causes?.join(" ") || "",
  actions: advice?.do_now?.length ? advice.do_now : advice?.actions_now || [],
  checks: advice?.check_next?.length
    ? advice.check_next
    : advice?.monitor_next || [],
  reasons: advice?.why_this_advice?.length
    ? advice.why_this_advice
    : advice?.evidence || [],
  avoid: advice?.avoid_for_now || [],
  recheck: advice?.recheck_after || advice?.recheck || "",
  getHelpIf: advice?.get_help_if || [],
  question: advice?.tell_us_next || advice?.follow_up_question || "",
  warning: advice?.safety_note || advice?.urgent_warning || "",
});

const ProblemAdvice: React.FC<{
  problem: FieldProblem;
  onSolved: () => void;
  canEdit: boolean;
}> = ({ problem, onSolved, canEdit }) => {
  const [details, setDetails] = useState(false);
  const latest =
    problem.responses?.[problem.responses.length - 1]?.advice ||
    problem.latest_advice;
  const view = adviceView(latest);
  const context = latest?.context_used;

  return (
    <Card variant="outlined" sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            spacing={1}
          >
            <Box>
              <Chip
                size="small"
                color={
                  problem.status === "resolved"
                    ? "success"
                    : problem.status === "needs_information"
                      ? "info"
                      : "warning"
                }
                label={
                  problem.status === "resolved"
                    ? "Solved"
                    : problem.status === "needs_information"
                      ? "One question"
                      : "Advice ready"
                }
                sx={{ mb: 1 }}
              />
              <Typography variant="h5">{view.headline}</Typography>
              {view.explanation && (
                <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                  {view.explanation}
                </Typography>
              )}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {problem.responses_remaining} follow-up
              {problem.responses_remaining === 1 ? "" : "s"} available
            </Typography>
          </Stack>

          {context && (
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 0.75 }}
              >
                Information used
              </Typography>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                <Chip
                  size="small"
                  color="success"
                  variant="outlined"
                  label={`${context.crop} · ${context.growth_stage}`}
                />
                <Chip
                  size="small"
                  color="success"
                  variant="outlined"
                  label="Farmer report"
                />
                <Chip
                  size="small"
                  color={context.recent_sensor_data ? "success" : "default"}
                  variant="outlined"
                  label={
                    context.recent_sensor_data
                      ? "Recent sensor data"
                      : "No recent sensor data"
                  }
                />
                <Chip
                  size="small"
                  color={context.current_weather ? "success" : "default"}
                  variant="outlined"
                  label={
                    context.current_weather
                      ? "Current weather"
                      : "Weather unavailable"
                  }
                />
                <Chip
                  size="small"
                  variant="outlined"
                  label={`${context.crop_reference_entries} crop reference notes`}
                />
                {(context.recent_field_problems || 0) > 0 && (
                  <Chip
                    size="small"
                    color="success"
                    variant="outlined"
                    label={`${context.recent_field_problems} recent ${context.recent_field_problems === 1 ? "problem" : "problems"}`}
                  />
                )}
              </Stack>
            </Box>
          )}

          {context &&
            !context.recent_sensor_data &&
            !context.current_weather && (
              <Alert severity="info">
                This advice uses your report and the crop guide. Add recent
                sensor readings and a Farm location for stronger field-specific
                advice.
              </Alert>
            )}

          {context?.decision_support_only && (
            <Alert severity="info" icon={<InfoOutlined />}>
              This is an early-warning guide, not a confirmed diagnosis. Check
              the crop before taking treatment action.
            </Alert>
          )}

          {view.warning && <Alert severity="warning">{view.warning}</Alert>}

          {view.actions.length > 0 && (
            <Box>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Do this now
              </Typography>
              <Stack spacing={1}>
                {view.actions.map((action, index) => (
                  <Stack
                    key={`${action}-${index}`}
                    direction="row"
                    spacing={1.25}
                    alignItems="flex-start"
                  >
                    <Box
                      sx={{
                        width: 25,
                        height: 25,
                        borderRadius: "50%",
                        bgcolor: "primary.main",
                        color: "white",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </Box>
                    <Typography>{action}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {view.checks.length > 0 && (
            <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 1.5 }}>
              <Typography fontWeight={800}>Check next</Typography>
              {view.checks.map((check, index) => (
                <Typography key={`${check}-${index}`} variant="body2">
                  • {check}
                </Typography>
              ))}
            </Box>
          )}

          {view.recheck && (
            <Alert severity="info" icon={<InfoOutlined />}>
              <Typography fontWeight={800}>Check the field again</Typography>
              <Typography variant="body2">{view.recheck}</Typography>
            </Alert>
          )}

          {view.avoid.length > 0 && (
            <Box
              sx={{
                border: 1,
                borderColor: "warning.light",
                borderRadius: 2,
                p: 1.5,
              }}
            >
              <Typography fontWeight={800}>Avoid for now</Typography>
              {view.avoid.map((item, index) => (
                <Typography key={`${item}-${index}`} variant="body2">
                  • {item}
                </Typography>
              ))}
            </Box>
          )}

          {view.getHelpIf.length > 0 && (
            <Box>
              <Typography fontWeight={800}>Get local help if</Typography>
              {view.getHelpIf.map((item, index) => (
                <Typography key={`${item}-${index}`} variant="body2">
                  • {item}
                </Typography>
              ))}
            </Box>
          )}

          {canEdit && problem.status !== "resolved" && (
            <Button
              variant="outlined"
              color="success"
              startIcon={<CheckCircleOutline />}
              onClick={onSolved}
              sx={{ alignSelf: "flex-start" }}
            >
              Mark as solved
            </Button>
          )}

          <Divider />
          <Button
            size="small"
            startIcon={<InfoOutlined />}
            onClick={() => setDetails((value) => !value)}
            sx={{ alignSelf: "flex-start" }}
          >
            {details ? "Hide details" : "Why this advice?"}
          </Button>
          <Collapse in={details}>
            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary">
                Reported: {problem.observation}
              </Typography>
              {view.reasons.map((reason, index) => (
                <Typography key={`${reason}-${index}`} variant="body2">
                  • {reason}
                </Typography>
              ))}
              {latest?.confidence && (
                <Typography variant="body2" color="text.secondary">
                  Evidence confidence: {latest.confidence}
                  {typeof context?.evidence_score === "number"
                    ? ` (${context.evidence_score}/8)`
                    : ""}
                </Typography>
              )}
              {context?.confidence_reason && (
                <Typography variant="body2" color="text.secondary">
                  {context.confidence_reason}
                </Typography>
              )}
              {(context?.data_limitations?.length || 0) > 0 && (
                <Box>
                  <Typography variant="body2" fontWeight={700}>
                    Information still missing
                  </Typography>
                  {context?.data_limitations?.map((limitation) => (
                    <Typography key={limitation} variant="body2">
                      {limitation}
                    </Typography>
                  ))}
                </Box>
              )}
              {(latest?.sources?.length || 0) > 0 && (
                <Typography variant="body2" color="text.secondary">
                  Sources: {latest?.sources?.join(", ")}
                </Typography>
              )}
            </Stack>
          </Collapse>
        </Stack>
      </CardContent>
    </Card>
  );
};

const Advisor: React.FC = () => {
  const { fieldId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("problem");
  const [problems, setProblems] = useState<FieldProblem[]>([]);
  const [selected, setSelected] = useState<FieldProblem | null>(null);
  const [observation, setObservation] = useState(
    () => searchParams.get("observation") || "",
  );
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [solveDialogOpen, setSolveDialogOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [error, setError] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [farmId, setFarmId] = useState("");

  const load = useCallback(async () => {
    try {
      const [list, farms] = await Promise.all([
        getFieldProblems(fieldId),
        getFarms(),
      ]);
      setProblems(list);
      const ownership = await Promise.all(
        farms.map(async (farm) => ({
          farm,
          fields: await getFarmFields(farm.id),
        })),
      );
      setCanEdit(
        ownership.some(
          ({ farm, fields }) =>
            farm.role === "owner" &&
            fields.some((field) => field.id === fieldId),
        ),
      );
      const containingFarm = ownership.find(({ fields }) =>
        fields.some((field) => field.id === fieldId),
      );
      setFarmId(containingFarm?.farm.id || "");
      if (selectedId) {
        setSelected(await getFieldProblem(fieldId, selectedId));
      } else {
        setSelected(null);
      }
    } catch {
      setError("Problems could not be loaded.");
    }
  }, [fieldId, selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const latestAdvice =
    selected?.responses?.[selected.responses.length - 1]?.advice;
  const latestQuestion =
    latestAdvice?.tell_us_next || latestAdvice?.follow_up_question || "";
  const openProblems = useMemo(
    () => problems.filter((problem) => problem.status !== "resolved"),
    [problems],
  );

  const report = async () => {
    if (observation.trim().length < 3) return;
    try {
      setBusy(true);
      setError("");
      const problem = await createFieldProblem(fieldId, observation.trim());
      setSelected(problem);
      setObservation("");
      setSearchParams({ problem: problem.id });
      await load();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not report this problem.",
      );
    } finally {
      setBusy(false);
    }
  };

  const respond = async () => {
    if (!selected || !answer.trim()) return;
    try {
      setBusy(true);
      setError("");
      const updated = await answerFieldProblem(
        fieldId,
        selected.id,
        answer.trim(),
      );
      setSelected(updated);
      setAnswer("");
      await load();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not update this problem.",
      );
    } finally {
      setBusy(false);
    }
  };

  const solve = async () => {
    if (!selected) return;
    try {
      setBusy(true);
      setSelected(await resolveFieldProblem(fieldId, selected.id, true, resolutionNote));
      setSolveDialogOpen(false);
      setResolutionNote("");
      await load();
    } catch {
      setError("Could not mark this problem as solved.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() =>
            selected
              ? setSearchParams({})
              : navigate(farmId ? `/farms/${farmId}` : "/farms")
          }
          sx={{ alignSelf: "flex-start" }}
        >
          Back
        </Button>
        <Box>
          <Typography variant="h4">Field problems</Typography>
          <Typography color="text.secondary">
            Report a change, follow the advice, then mark it solved.
          </Typography>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}

        {selected ? (
          <>
            <ProblemAdvice
              problem={selected}
              onSolved={() => setSolveDialogOpen(true)}
              canEdit={canEdit}
            />
            {canEdit &&
              selected.status === "needs_information" &&
              selected.responses_remaining > 0 &&
              latestQuestion && (
                <Card>
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Typography variant="h6">One question</Typography>
                      <Typography>{latestQuestion}</Typography>
                      <TextField
                        label="Your answer"
                        value={answer}
                        onChange={(event) => setAnswer(event.target.value)}
                        multiline
                        minRows={2}
                      />
                      <Button
                        variant="contained"
                        disabled={busy || !answer.trim()}
                        onClick={respond}
                      >
                        {busy ? "Checking…" : "Continue"}
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              )}
          </>
        ) : (
          <>
            {canEdit && (
              <Card>
                <CardContent>
                  <Stack spacing={1.5}>
                    <Typography variant="h6">Report a problem</Typography>
                    <TextField
                      label="What did you notice?"
                      placeholder="Example: Lower leaves turned yellow three days ago"
                      value={observation}
                      onChange={(event) => setObservation(event.target.value)}
                      multiline
                      minRows={3}
                      inputProps={{ maxLength: 1000 }}
                      helperText="Include when it started, how much of the crop is affected, and any insects, spots, wilting, or recent watering."
                    />
                    <Button
                      variant="contained"
                      startIcon={<ReportProblemOutlined />}
                      disabled={busy || observation.trim().length < 3}
                      onClick={report}
                    >
                      {busy ? "Checking…" : "Get field advice"}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            )}
            {openProblems.length > 0 && (
              <Box>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Open problems
                </Typography>
                <Stack spacing={1}>
                  {openProblems.map((problem) => (
                    <Card
                      key={problem.id}
                      variant="outlined"
                      onClick={() => setSearchParams({ problem: problem.id })}
                      sx={{ cursor: "pointer" }}
                    >
                      <CardContent>
                        <Stack
                          direction="row"
                          justifyContent="space-between"
                          spacing={1}
                        >
                          <Box>
                            <Typography fontWeight={800}>
                              {problem.title}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {problem.crop} · {problem.stage}
                            </Typography>
                          </Box>
                          <Chip
                            size="small"
                            label={
                              problem.status === "needs_information"
                                ? "Question"
                                : "Advice ready"
                            }
                          />
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              </Box>
            )}
          </>
        )}
        <Dialog
          open={solveDialogOpen}
          onClose={() => {
            if (!busy) setSolveDialogOpen(false);
          }}
          fullWidth
          maxWidth="sm"
        >
          <DialogTitle>Mark this problem as solved?</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              multiline
              minRows={2}
              sx={{ mt: 1 }}
              label="What helped? (optional)"
              value={resolutionNote}
              onChange={(event) => setResolutionNote(event.target.value)}
              inputProps={{ maxLength: 500 }}
              helperText="This helps improve future advice for this Field."
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSolveDialogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="contained" color="success" onClick={solve} disabled={busy}>
              {busy ? "Saving…" : "Mark solved"}
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    </Container>
  );
};

export default Advisor;
