
import { MachineConfig, send, Action, assign } from "xstate";
import { createMachine } from 'xstate';

function say(text: string): Action<SDSContext, SDSEvent> {
  return send((_context: SDSContext) => ({ type: "SPEAK", value: text}));
}


/*interface Grammar {
  [index: string]: {
    intent: string;
    entities: {
      [index: string]: string;
    };
  };
}*/

const getIntent = (context: SDSContext, entity: string) => {
  console.log('nluResult:');
  console.log(context.nluResult)
  if (context.nluResult && context.nluResult.prediction && context.nluResult.prediction.intents) {
    return context.nluResult.prediction.intents[0].category;
  } else {
    return null;
  }
}; 

const getEntity = (context: SDSContext, entity: string) => {
  console.log('nluResult:');
  console.log(context.nluResult);
  if (context.nluResult && context.nluResult.prediction && context.nluResult.prediction.entities) {
    const entities = context.nluResult.prediction.entities;
    console.log(entities.length)
    if (entities && entities.length > 0) {
      return context.nluResult.prediction.entities[0].text;
    } else {
      return null;
    }
  } else {
    return null;
  }
};


export const dmMachine: MachineConfig<SDSContext, any, SDSEvent> = {
  initial: "idle",
  states: {
    idle: {
      on: {
        CLICK: "init",
      },
    },
    init: {
      on: {
        TTS_READY: "usersname", 
        CLICK: "usersname", 
      },
    },
    usersname: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "welcome",
            actions: assign({
              username: (context) => context.recResult[0].utterance.replace(/\.$/g, "")
            }),
          },
          {
            target: ".notmatch",
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: say("Hello! Can you tell me your name or how you'd like me to address you?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        notmatch: {
          entry: say("Sorry, could you repeat again?"),
          on: { ENDSPEECH: "ask" },
        }
      },
    },
    
    welcome: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "Meeting",
            cond: (context) => getIntent(context, "") === "create a meeting",
          },
          {
            target: "who_is_it",
            cond: (context) => getIntent(context, "") === "ask a person",
          },
          {
            target: ".notmatch",
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Hi ${context.username}! Would you like to create a meeting or ask a person?`,
          })),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        notmatch: {
          entry: say(
            "Sorry, I don't understand. Would you like to create a meeting or ask a person?"
          ),
          on: { ENDSPEECH: "ask" },
        },
      },
    },
    who_is_it: {
      id:"who_is_it",
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: ".getInfo",
            actions: assign({type:context => {return context.recResult[0].utterance},
            }),
          },
          {
            target: ".nomatch",
          },
        ],
        TIMEOUT: ".prompt",
      }, 
      states: {
        getInfo: {
          invoke: {
            id: 'getInfo',
            src: (context, event) => kbRequest(context.type),
            onDone: [{
              target: 'success',
              cond: (context, event) => event.data.Abstract !== "",
              actions: assign({ info: (context, event) => event.data })
            },
            {
              target: 'fail',
            },
          ],
            onError: {
              target: 'fail',
            }
          }
        },
        success: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `This is what I found on the web about ${context.whois}. ${context.info.Abstract}`
          })),
          on: {ENDSPEECH: "#meetX"}
        },
        fail: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Sorry, I cannot find anything about ${context.whois}.`
          })),
          on: {ENDSPEECH: "prompt"}
        },
        prompt: {
          entry: say("Which celebrity do you want to know more about?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          id: "who_is_it",
          entry: send("LISTEN"),
        },
        nomatch: {
          entry: say(
            "Sorry, I don't know what it is. Tell me something I know."
          ),
          on: { ENDSPEECH: "#who_is_it" },
        },
      },
    },
    Meeting: {
      entry: say("Ok!"),
      on: { ENDSPEECH: "createmeeting" },
      },
    meetX: {
      id:"meetX",
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "acceptmeeting",
            cond: (context) => getIntent(context) === "confirm",
          },
          {
            target: "refusemeeting",
            cond: (context) => getIntent(context) === "reject",
          },
          {
            target: ".notmatch",
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: say("Do you want to meet them?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        notmatch: {
          entry: say(
            "Sorry, could you please repeat aganin?"
          ),
          on: {ENDSPEECH: "prompt"},
        },
      },
    },
    refusemeeting: {
      entry: say("OK!"),
      on: { ENDSPEECH: "init" },
    },
    acceptmeeting: {
      entry: [
        say("OK! Let's schedule a meeting!"),
        assign((context) => ({type: `meeting with ${context.type}`}))
      ],
      on: { ENDSPEECH: "askDate" },
      },
    createmeeting: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "info",
            cond: (context) => getIntent(context) === "meeting" && getEntity(context) != false,
            actions: assign({
              type: (context) => getEntity(context, "title"),
            }),
          },
          {
            target: ".notmatch",
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: say("Let's create a meeting. What is it about?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        notmatch: {
          entry: say(
            "Sorry, I don't know what it is. Please tell me what is the meeting about?"
          ),
          on: { ENDSPEECH: "ask" },
        },
      },
    },
    info: {
      entry: send((context) => ({
        type: "SPEAK",
        value: `OK, ${context.type}`,
      })),
      on: { ENDSPEECH: "askDate" },
      },
    askDate: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "day",
            cond: (context) => getIntent(context) === "day_of_meeting",
            actions: assign({
              date: (context) => getEntity(context, "day"),
            }),
          },
          {
            target: ".notmatch",
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: say("On which day is the meeting?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        notmatch: {
          entry: say(
            "Sorry, I don't understand! Could you please repeat again?"
          ),
          on: { ENDSPEECH: "ask" },
        },
      },
    },
    day: {
      entry: send((context) => ({
        type: "SPEAK",
        value: `OK, the meeting has been scheduled on ${context.date}`,
      })),
      on: { ENDSPEECH: "isWholeDay" },
    },
    isWholeDay: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "negative",
            cond: (context) => getIntent(context) === "reject", 
          },
          {
            target: "positive",
            cond: (context) => getIntent(context) === "confirm", 
          },
          {
            target: ".notmatch",
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: say("Will it take the whole day?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        notmatch: {
          entry: say(
            "Sorry, I don't understand. Will it take the whole day?"
          ),
          on: { ENDSPEECH: "ask" },
        },
      },
    },
    negative: {
      entry: say("The meeting will not last for the whole day."),
      on: { ENDSPEECH: "Time" },
    },
    positive: {
      entry: say("The meeting will last for the whole day."),
      on: { ENDSPEECH: "meetingcreated" },
    },
    Time: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "time",
            cond: (context) => getIntent(context) === "time_of_meeting",
            actions: assign({
              time: (context) => getEntity(context, "time"),
            }),
          },
          {
            target: ".notmatch",
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: say("What time is it?"),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        notmatch: {
          entry: say(
            "Sorry, I don't understand. What time is your meeting?"
          ),
          on: { ENDSPEECH: "ask" },
        },
      },
    },
    time: {
      entry: send((context) => ({
        type: "SPEAK",
        value: `OK, time of the meeting is ${context.time}`,
      })),
      on: { ENDSPEECH: "meetConfirm" },
    },
    meetConfirm: {
      initial: "prompt",
      on: {
        RECOGNISED: [
          {
            target: "meetingcreated",
            cond: (context) => getIntent(context) === "confirm",
          },
          {
            target: "meetingrescheduled",
            cond: (context) => getIntent(context) === "reject",
          },
          {
            target: ".notmatch",
          },
        ],
        TIMEOUT: ".prompt",
      },
      states: {
        prompt: {
          entry: send((context) => ({
            type: "SPEAK",
            value: `Do you want me to create a meeting titled ${context.type}, on ${context.date} at ${context.time}?`,
          })),
          on: { ENDSPEECH: "ask" },
        },
        ask: {
          entry: send("LISTEN"),
        },
        notmatch: {
          entry: say(
            "Sorry, I don't understand. Could you repeat again?"
          ),
          on: { ENDSPEECH: "ask" },
        },
      },
    },
    meetingcreated: {
      entry: say('OK! Your meeting has been created successfully'),
      on: { ENDSPEECH: "init" },
    },
    meetingrescheduled: {
      entry: say("ok!, starting over!"),
      on: { ENDSPEECH: "welcome" },
    },
  },
};


const kbRequest = (text: string) =>
  fetch(
    new Request(
      `https://cors.eu.org/https://api.duckduckgo.com/?q=${text}&format=json&skip_disambig=1`
    )
  ).then((data) => data.json());
            
            
            
            
      
