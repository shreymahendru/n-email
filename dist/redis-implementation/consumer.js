"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const n_util_1 = require("@nivinjoseph/n-util");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const eda_manager_1 = require("../eda-manager");
const n_exception_1 = require("@nivinjoseph/n-exception");
class Consumer {
    constructor(client, manager, topic, partition, onEventReceived) {
        this._edaPrefix = "n-eda";
        this._isDisposed = false;
        this._consumePromise = null;
        n_defensive_1.given(client, "client").ensureHasValue().ensureIsObject();
        this._client = client;
        n_defensive_1.given(manager, "manager").ensureHasValue().ensureIsObject().ensureIsType(eda_manager_1.EdaManager);
        this._manager = manager;
        this._logger = this._manager.serviceLocator.resolve("Logger");
        n_defensive_1.given(topic, "topic").ensureHasValue().ensureIsString();
        this._topic = topic;
        n_defensive_1.given(partition, "partition").ensureHasValue().ensureIsNumber();
        this._partition = partition;
        n_defensive_1.given(onEventReceived, "onEventReceived").ensureHasValue().ensureIsFunction();
        this._onEventReceived = onEventReceived;
    }
    consume() {
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException(this);
        n_defensive_1.given(this, "this").ensure(t => !t._consumePromise, "consumption has already commenced");
        this._consumePromise = this.beginConsume();
    }
    dispose() {
        if (!this._isDisposed)
            this._isDisposed = true;
        return this._consumePromise || Promise.resolve();
    }
    beginConsume() {
        return __awaiter(this, void 0, void 0, function* () {
            while (true) {
                if (this._isDisposed)
                    return;
                try {
                    const writeIndex = yield this.getPartitionWriteIndex();
                    const readIndex = yield this.getConsumerPartitionReadIndex();
                    if (readIndex >= writeIndex) {
                        yield n_util_1.Delay.milliseconds(200);
                        continue;
                    }
                    const indexToRead = readIndex + 1;
                    const event = yield this.retrieveEvent(indexToRead);
                    if (event == null) {
                        yield n_util_1.Delay.seconds(1);
                        continue;
                    }
                    const eventName = event.name || event.$name;
                    const eventRegistration = this._manager.eventMap.get(eventName);
                    const deserializedEvent = eventRegistration.eventType.deserializeEvent(event);
                    const scope = this._manager.serviceLocator.createScope();
                    deserializedEvent.$scope = scope;
                    this._onEventReceived(scope, this._topic, deserializedEvent);
                    const handler = scope.resolve(eventRegistration.eventHandlerTypeName);
                    try {
                        yield handler.handle(deserializedEvent);
                    }
                    catch (error) {
                        yield this._logger.logWarning(`Error in EventHandler while handling event of type '${eventName}' with data ${JSON.stringify(event)}.`);
                        yield this._logger.logError(error);
                    }
                    finally {
                        yield this.incrementConsumerPartitionReadIndex();
                        yield scope.dispose();
                    }
                }
                catch (error) {
                    yield this._logger.logWarning(`Error in consumer => ConsumerGroupId: ${this._manager.consumerGroupId}; Topic: ${this._topic}; Partition: ${this._partition};`);
                    yield this._logger.logError(error);
                    yield n_util_1.Delay.minutes(1);
                }
            }
        });
    }
    getPartitionWriteIndex() {
        const key = `${this._edaPrefix}-${this._topic}-${this._partition}-write-index`;
        return new Promise((resolve, reject) => {
            this._client.get(key, (err, value) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(JSON.parse(value) || 0);
            });
        });
    }
    getConsumerPartitionReadIndex() {
        const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${this._manager.consumerGroupId}-read-index`;
        return new Promise((resolve, reject) => {
            this._client.get(key, (err, value) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(JSON.parse(value) || 0);
            });
        });
    }
    incrementConsumerPartitionReadIndex() {
        const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${this._manager.consumerGroupId}-read-index`;
        return new Promise((resolve, reject) => {
            this._client.incr(key, (err, val) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(val);
            });
        });
    }
    retrieveEvent(indexToRead) {
        return new Promise((resolve, reject) => {
            const key = `${this._edaPrefix}-${this._topic}-${this._partition}-${indexToRead}`;
            this._client.get(key, (err, value) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(JSON.parse(value));
            });
        });
    }
}
exports.Consumer = Consumer;
//# sourceMappingURL=consumer.js.map